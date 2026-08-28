import type { ThoughtNode, ThoughtEdge, Attachment } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';

// Claude Code session importer — the continuity layer's READ direction for
// one concrete runner. A session lives as JSONL under ~/.claude/projects/;
// each line is an event (user / assistant / system / metadata), chained by
// uuid → parentUuid, with an assistant turn often split across several
// lines (thinking, text, tool_use each on their own).
//
// Projection rules (v0, deliberately honest about what it drops):
//   - A TURN = one user text message plus everything the assistant did
//     until the next user text message → one Q/A node.
//   - Tool calls pair with their results (tool_use.id ↔ tool_result.
//     tool_use_id) into ATOMIC text attachments on the turn's node — the
//     existing per-attachment exclude dial makes each one individually
//     prunable, which is the whole point of importing.
//   - `thinking` blocks are dropped: they never re-enter a next turn's
//     context in the source runner either, and this importer projects
//     context, not the model's private reasoning.
//   - Sidechain (subagent) events are skipped in v0.
//   - A compaction boundary becomes a [Note] node wired into the next
//     turn: the source model's history was truncated there, and an honest
//     projection keeps that visible and prunable.
//   - Sessions can carry thousands of turns; only the most recent
//     MAX_TURNS import, and a [Note] node says so out loud.
// The source session file is never written — read-only by contract.

const MAX_TURNS = 200;
const TOOL_RESULT_LIMIT = 4000;
const TOOL_CALL_LIMIT = 800;

interface ContentPart {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface SessionLine {
  type?: string;
  subtype?: string;
  uuid?: string;
  sessionId?: string;
  isSidechain?: boolean;
  customTitle?: string;
  slug?: string;
  timestamp?: string;
  compactMetadata?: { preTokens?: number; postTokens?: number };
  message?: {
    role?: string;
    content?: string | ContentPart[];
  };
}

interface Turn {
  question: string;
  response: string;
  itemIds: string[];
  tools: { name: string; call: string; result: string; truncated: boolean }[];
  compactionBefore?: string; // note text for a compaction boundary preceding this turn
}

function textParts(content: string | ContentPart[] | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n');
}

function resultText(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => (p.type === 'text' && p.text ? p.text : p.type === 'image' ? '[image result omitted]' : ''))
    .filter(Boolean)
    .join('\n');
}

const clip = (s: string, limit: number): { text: string; truncated: boolean } =>
  s.length > limit ? { text: `${s.slice(0, limit)}\n…[truncated, ${s.length} chars total]`, truncated: true } : { text: s, truncated: false };

/** Parse JSONL text into lines; null when this is not a Claude Code session. */
export function parseClaudeCodeSession(text: string): { lines: SessionLine[]; sessionId: string; title: string } | null {
  const lines: SessionLine[] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    try { lines.push(JSON.parse(t) as SessionLine); } catch { /* non-JSON line: skip */ }
  }
  const marker = lines.find((l) => (l.type === 'user' || l.type === 'assistant') && l.uuid && l.sessionId);
  if (!marker) return null;
  const title = [...lines].reverse().find((l) => l.type === 'custom-title' && l.customTitle)?.customTitle
    ?? lines.find((l) => l.slug)?.slug
    ?? `session ${marker.sessionId!.slice(0, 8)}`;
  return { lines, sessionId: marker.sessionId!, title };
}

function collectTurns(lines: SessionLine[]): Turn[] {
  const turns: Turn[] = [];
  // tool_use id → registration, so results pair up even across lines
  const pendingTools = new Map<string, { name: string; call: string }>();
  let current: Turn | null = null;
  let pendingCompaction: string | undefined;

  const flush = () => {
    if (current && (current.question || current.response || current.tools.length)) turns.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.isSidechain) continue;

    if (line.type === 'system' && line.subtype === 'compact_boundary') {
      flush();
      const m = line.compactMetadata;
      pendingCompaction = `[Compaction] The source runner compacted its history here${
        m?.preTokens ? ` (${m.preTokens} → ${m.postTokens ?? '?'} tokens)` : ''
      }. Everything above this point reached later turns only as a summary.`;
      continue;
    }

    if (line.type === 'user') {
      const content = line.message?.content;
      // tool results ride user lines — pair them with their pending call
      if (Array.isArray(content)) {
        for (const p of content) {
          if (p.type === 'tool_result' && p.tool_use_id) {
            const reg = pendingTools.get(p.tool_use_id);
            if (reg && current) {
              const res = clip(resultText(p.content), TOOL_RESULT_LIMIT);
              current.tools.push({ name: reg.name, call: reg.call, result: res.text, truncated: res.truncated });
              pendingTools.delete(p.tool_use_id);
            }
          }
        }
      }
      const text = textParts(content);
      if (text.trim()) {
        flush();
        current = { question: text, response: '', itemIds: line.uuid ? [line.uuid] : [], tools: [] };
        if (pendingCompaction) {
          current.compactionBefore = pendingCompaction;
          pendingCompaction = undefined;
        }
      }
      continue;
    }

    if (line.type === 'assistant' && current) {
      if (line.uuid) current.itemIds.push(line.uuid);
      const content = line.message?.content;
      const text = textParts(content);
      if (text.trim()) current.response = current.response ? `${current.response}\n\n${text}` : text;
      if (Array.isArray(content)) {
        for (const p of content) {
          if (p.type === 'tool_use' && p.id && p.name) {
            const call = clip(JSON.stringify(p.input ?? {}), TOOL_CALL_LIMIT);
            pendingTools.set(p.id, { name: p.name, call: call.text });
          }
        }
      }
    }
  }
  flush();
  return turns;
}

/** Map-plaque seed for an imported turn: the response's first line stands
 *  in as the takeaway until (if ever) a judge writes a real one. Display
 *  layer only — context never reads summaries. */
function seedPlaque(node: ThoughtNode): void {
  const first = node.data.response.split('\n').map((l) => l.trim()).find((l) => l && !/^[#>*`-]+$/.test(l));
  if (first) node.data.summaries = [first.replace(/^[#>*`\s]+/, '').slice(0, 90)];
}

function noteNode(text: string): ThoughtNode {
  // every canvas node is React Flow type 'thought'; stepKind dispatches
  const n = makeNode(text, '', false);
  n.data.stepKind = 'note';
  return n;
}

function buildGraph(session: { lines: SessionLine[]; sessionId: string }): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const all = collectTurns(session.lines);
  const turns = all.slice(-MAX_TURNS);
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;

  const link = (source: ThoughtNode, target: ThoughtNode) => {
    edges.push({ id: generateId(), source: source.id, target: target.id, type: 'smoothstep' } as ThoughtEdge);
  };

  if (all.length > turns.length) {
    const note = noteNode(`[Imported tail] This session holds ${all.length} turns; the most recent ${turns.length} were imported. The source file keeps everything.`);
    nodes.push(note);
    prev = note;
  }

  for (const turn of turns) {
    if (turn.compactionBefore) {
      const note = noteNode(turn.compactionBefore);
      nodes.push(note);
      if (prev) link(prev, note);
      prev = note;
    }
    const node = makeNode(turn.question, turn.response, prev === null);
    node.data.importSource = { runner: 'claude-code', sessionId: session.sessionId, itemIds: turn.itemIds };
    seedPlaque(node);
    node.data.attachments = turn.tools.map((tool): Attachment => ({
      id: generateId(),
      name: `tool: ${tool.name}${tool.truncated ? ' (truncated)' : ''}`,
      type: 'text/plain',
      size: tool.call.length + tool.result.length,
      content: `[call] ${tool.call}\n[result]\n${tool.result}`,
    }));
    nodes.push(node);
    if (prev) link(prev, node);
    prev = node;
  }

  const laid = autoLayout(nodes, edges);
  // Layout law: content notes are user-arranged material and autoLayout
  // never touches them — so the importer places its own notes by hand,
  // slotted into the chain gap they narrate (compaction, imported tail).
  for (let i = 0; i < laid.length; i++) {
    const n = laid[i];
    if (n.data.stepKind !== 'note') continue;
    n.width = 460;
    const next = laid.slice(i + 1).find((x) => x.data.stepKind !== 'note');
    const before = laid.slice(0, i).reverse().find((x) => x.data.stepKind !== 'note');
    // beside the chain, not inside it: a note is an annotation column —
    // wedging it between two tall cards would just stack paper
    if (before && next) n.position = { x: Math.min(before.position.x, next.position.x) - 520, y: (before.position.y + next.position.y) / 2 };
    else if (next) n.position = { x: next.position.x - 520, y: next.position.y };
    else if (before) n.position = { x: before.position.x - 520, y: before.position.y + 140 };
  }
  return { nodes: laid, edges };
}

/** The harvest half of the experiment loop: a SHORT experiment session
 *  becomes a branch hanging off the node it was compiled from. The anchor
 *  line traveled inside the session's first user message; the caller has
 *  already resolved it to a live node. Returns the branch subgraph, laid
 *  out beside the anchor (never re-laying the user's canvas). */
export function claudeCodeSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number; anchorText: string | null } | null {
  const session = parseClaudeCodeSession(text);
  if (!session) return null;
  const turns = collectTurns(session.lines);
  if (turns.length === 0) return null;

  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: { id: string } = { id: anchorNode.id };
  for (const turn of turns) {
    const node = makeNode(turn.question, turn.response, false);
    node.data.importSource = { runner: 'claude-code', sessionId: session.sessionId, itemIds: turn.itemIds };
    seedPlaque(node);
    node.data.attachments = turn.tools.map((tool): Attachment => ({
      id: generateId(),
      name: `tool: ${tool.name}${tool.truncated ? ' (truncated)' : ''}`,
      type: 'text/plain',
      size: tool.call.length + tool.result.length,
      content: `[call] ${tool.call}\n[result]\n${tool.result}`,
    }));
    if (nodes.length === 0) node.data.isBranch = true; // the experiment forks off sideways
    nodes.push(node);
    edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    prev = node;
  }
  // lay the branch out in its own frame, then move it beside the anchor —
  // the user's own arrangement is never touched
  const laid = autoLayout(nodes, edges.filter((e) => e.source !== anchorNode.id));
  const minX = Math.min(...laid.map((n) => n.position.x));
  const minY = Math.min(...laid.map((n) => n.position.y));
  for (const n of laid) {
    n.position = { x: n.position.x - minX + anchorNode.x + 560, y: n.position.y - minY + anchorNode.y };
  }
  return { nodes: laid, edges, turnCount: turns.length, anchorText: turns[0].question };
}

/** The importable-conversation wrapper the existing import modal consumes. */
export function claudeCodeSessionConversation(text: string): ImportableConversation | null {
  const session = parseClaudeCodeSession(text);
  if (!session) return null;
  const turnCount = collectTurns(session.lines).length;
  if (turnCount === 0) return null;
  return {
    title: session.title,
    messageCount: turnCount,
    source: 'claude-code',
    build: () => buildGraph(session),
  };
}
