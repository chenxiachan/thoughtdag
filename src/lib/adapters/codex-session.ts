import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';
import { turnsToBranch, seedPlaque, toolAttachments, dropSelfCommandTurns } from './shared';

// Codex session importer — Tier 1 (read-only) of the second runner adapter.
// A session lives as a rollout JSONL under ~/.codex/sessions/; each line is
// {timestamp, type, payload}. Two parallel channels record the same run:
// event_msg (UI event stream) and response_item (what the MODEL actually
// saw). This importer projects from response_item — the context surface —
// which is exactly what a context-repair tool should show.
//
// Projection rules (v0):
//   - Turns are explicit: turn_context / task_started carry turn_id.
//   - question = the turn's response_item message role=user (input_text).
//   - response = role=assistant output_text, in order (commentary and
//     final answer both lived in the model's context — both project).
//   - function_call pairs with function_call_output by call_id into one
//     atomic attachment (same grammar as the Claude Code adapter).
//   - reasoning items are ENCRYPTED upstream — dropped, and honestly
//     undroppable anyway.
//   - role=developer messages (sandbox/permission boilerplate re-sent each
//     turn) are runner template, not conversation — dropped.
//   - MAX_TURNS tail cap + note, compaction-free (Codex compacts via its
//     own mechanisms not visible in the rollout — nothing to mark yet).
// The source rollout is never written — read-only by contract.

const TOOL_RESULT_LIMIT = 4000;
const TOOL_CALL_LIMIT = 800;

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    // session_meta
    id?: string;
    cwd?: string;
    originator?: string;
    // turn boundaries
    turn_id?: string;
    // messages
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    message?: string;
    // tools
    name?: string;
    arguments?: string;
    call_id?: string;
    output?: string;
  };
}

interface Turn {
  question: string;
  response: string;
  itemIds: string[];
  tools: { name: string; call: string; result: string; truncated: boolean }[];
}

const clip = (s: string, limit: number): { text: string; truncated: boolean } =>
  s.length > limit ? { text: `${s.slice(0, limit)}\n…[truncated, ${s.length} chars total]`, truncated: true } : { text: s, truncated: false };

const partText = (content: Array<{ type?: string; text?: string }> | undefined): string =>
  (content ?? []).filter((p) => p.text && (p.type === 'input_text' || p.type === 'output_text' || p.type === 'text'))
    .map((p) => p.text).join('\n');

/** Parse rollout JSONL; null when this is not a Codex session. */
export function parseCodexSession(text: string): { lines: RolloutLine[]; sessionId: string; title: string } | null {
  const lines: RolloutLine[] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    try { lines.push(JSON.parse(t) as RolloutLine); } catch { /* skip */ }
  }
  const meta = lines.find((l) => l.type === 'session_meta' && l.payload?.id);
  const hasItems = lines.some((l) => l.type === 'response_item' || l.type === 'event_msg');
  if (!meta || !hasItems) return null;
  const cwd = meta.payload?.cwd ?? '';
  const dir = cwd.split('/').filter(Boolean).pop();
  const day = (meta.payload as { timestamp?: string } | undefined)?.timestamp?.slice(0, 10) ?? '';
  const title = ['codex', dir, day].filter(Boolean).join(' · ');
  return { lines, sessionId: meta.payload!.id!, title };
}

function collectTurns(lines: RolloutLine[]): Turn[] {
  const turns: Turn[] = [];
  const pendingCalls = new Map<string, { name: string; call: string }>();
  let current: Turn | null = null;

  const flush = () => {
    if (current && (current.question || current.response || current.tools.length)) turns.push(current);
    current = null;
  };
  const ensure = (): Turn => {
    if (!current) current = { question: '', response: '', itemIds: [], tools: [] };
    return current;
  };

  for (const line of lines) {
    const p = line.payload ?? {};
    if (line.type === 'turn_context' || (line.type === 'event_msg' && p.type === 'task_started')) {
      flush();
      const t = ensure();
      if (p.turn_id) t.itemIds.push(p.turn_id);
      continue;
    }
    if (line.type !== 'response_item') continue;
    if (p.type === 'message') {
      if (p.role === 'user') {
        const t = ensure();
        const text = partText(p.content);
        if (text.trim()) t.question = t.question ? `${t.question}\n\n${text}` : text;
      } else if (p.role === 'assistant') {
        const t = ensure();
        const text = partText(p.content);
        if (text.trim()) t.response = t.response ? `${t.response}\n\n${text}` : text;
      }
      // role=developer: runner boilerplate, dropped
    } else if (p.type === 'function_call' && p.call_id && p.name) {
      const call = clip(String(p.arguments ?? ''), TOOL_CALL_LIMIT);
      pendingCalls.set(p.call_id, { name: p.name, call: call.text });
    } else if (p.type === 'function_call_output' && p.call_id) {
      const reg = pendingCalls.get(p.call_id);
      if (reg) {
        const t = ensure();
        const res = clip(String(p.output ?? ''), TOOL_RESULT_LIMIT);
        t.tools.push({ name: reg.name, call: reg.call, result: res.text, truncated: res.truncated });
        pendingCalls.delete(p.call_id);
      }
    }
  }
  flush();
  return dropSelfCommandTurns(turns);
}

function buildGraph(session: { lines: RolloutLine[]; sessionId: string }): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  // faithful projection: EVERY turn imports — no tail cap (see the Claude
  // Code adapter for the rationale; the rule is runner-agnostic).
  const turns = collectTurns(session.lines);
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;

  for (const turn of turns) {
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, prev === null);
    node.data.importSource = { runner: 'codex', sessionId: session.sessionId, itemIds: turn.itemIds };
    node.data.attachments = toolAttachments(turn);
    seedPlaque(node);
    nodes.push(node);
    if (prev) edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    prev = node;
  }

  return { nodes: autoLayout(nodes, edges), edges };
}

/** Harvest: a short Codex experiment session hangs off the node it was
 *  compiled from — same runner-agnostic branch builder as Claude Code. */
export function codexSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  const session = parseCodexSession(text);
  if (!session) return null;
  return turnsToBranch(collectTurns(session.lines), session.sessionId, 'codex', anchorNode);
}

/** The importable-conversation wrapper the import modal consumes. */
export function codexSessionConversation(text: string): ImportableConversation | null {
  const session = parseCodexSession(text);
  if (!session) return null;
  const turnCount = collectTurns(session.lines).length;
  if (turnCount === 0) return null;
  return {
    title: session.title,
    messageCount: turnCount,
    source: 'codex',
    build: () => buildGraph(session),
  };
}
