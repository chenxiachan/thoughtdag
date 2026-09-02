import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';
import {
  turnsToBranch, seedPlaque, toolAttachments, dropSelfCommandTurns, markImporterNote, toolOpOf, clipText,
  TOOL_CALL_LIMIT, ARTIFACT_CALL_LIMIT, TOOL_RESULT_LIMIT, type RunnerTool,
} from './shared';

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

/** apply_patch names its files in the patch header — deterministic, no
 *  command parsing. Other codex tools touch files only through shell
 *  commands, which this importer does not guess at. */
function patchPaths(patch: string): string[] {
  const out: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) out.push(m[1].trim());
  return out;
}

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
    // tools (function_call pair and the newer custom_tool_call pair)
    name?: string;
    arguments?: string;
    input?: string;
    call_id?: string;
    output?: unknown;
  };
}

export interface CodexTurn {
  question: string;
  response: string;
  itemIds: string[];
  tools: RunnerTool[];
  at?: string;
  compactionBefore?: string;
}

const clip = clipText;

const partText = (content: Array<{ type?: string; text?: string }> | undefined): string =>
  (content ?? []).filter((p) => p.text && (p.type === 'input_text' || p.type === 'output_text' || p.type === 'text'))
    .map((p) => p.text).join('\n');

// System context injected UNDER the user role (<recommended_plugins>,
// <environment_context>, stray </image> markers…) is runner template, not
// conversation — the same judgment as developer messages. A real user
// opening with an XML-ish tag is vanishingly rare; erring here costs one
// prompt's first block, erring the other way floods the canvas.
const INJECTED = /^\s*<\/?[a-zA-Z_][\w-]*[^>]*>/;
const isInjectedUserText = (text: string): boolean =>
  INJECTED.test(text) || text.trimStart().startsWith('# AGENTS.md instructions for ');
const userPartText = (content: Array<{ type?: string; text?: string }> | undefined): string =>
  (content ?? []).filter((p) => p.text && (p.type === 'input_text' || p.type === 'text') && !isInjectedUserText(p.text))
    .map((p) => p.text).join('\n');

// custom_tool_call_output.output arrives as parts; function_call_output
// as a string — one reader for both shapes
const outputText = (output: unknown): string => {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return (output as Array<{ text?: string }>).map((p) => p?.text ?? '').filter(Boolean).join('\n');
  return output == null ? '' : JSON.stringify(output);
};

/** Streaming turn collector: lines go in one at a time (a 619MB rollout
 *  is a real file — no path may hold the whole text), turns accumulate
 *  small (tool results clipped on entry). The whole adapter runs on this;
 *  the string-based entry points below are thin wrappers. */
export class CodexSessionCollector {
  private turns: CodexTurn[] = [];
  private pendingCalls = new Map<string, { name: string; call: string; paths: string[]; op: RunnerTool['op'] }>();
  private current: CodexTurn | null = null;
  private pendingCompaction: string | undefined;
  private sessionId: string | null = null;
  private cwd = '';
  private day = '';
  private sawItems = false;
  private firstQuestion: string | null = null;
  private parentThreadId: string | null = null;

  feedLine(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    let line: RolloutLine;
    try { line = JSON.parse(t) as RolloutLine; } catch { return; }
    this.feed(line);
  }

  private flush(): void {
    const c = this.current;
    if (c && (c.question || c.response || c.tools.length)) this.turns.push(c);
    this.current = null;
  }

  private ensure(): CodexTurn {
    if (!this.current) {
      this.current = { question: '', response: '', itemIds: [], tools: [] };
      if (this.pendingCompaction) {
        this.current.compactionBefore = this.pendingCompaction;
        this.pendingCompaction = undefined;
      }
    }
    return this.current;
  }

  private feed(line: RolloutLine): void {
    const p = line.payload ?? {};
    if (line.type === 'session_meta' && p.id && !this.sessionId) {
      this.sessionId = p.id;
      this.cwd = p.cwd ?? '';
      this.day = (p as { timestamp?: string }).timestamp?.slice(0, 10) ?? '';
      this.parentThreadId = (p as { parent_thread_id?: string }).parent_thread_id ?? null;
      return;
    }
    if (line.type === 'response_item' || line.type === 'event_msg') this.sawItems = true;
    if (line.type === 'compacted') {
      // the runner replaced its live history with a summary here — an
      // honest projection keeps that boundary visible
      this.flush();
      this.pendingCompaction = '[Compaction] The source runner compacted its history here. Everything above this point reached later turns only as a summary.';
      return;
    }
    if (line.type === 'turn_context' || (line.type === 'event_msg' && p.type === 'task_started')) {
      this.flush();
      const t = this.ensure();
      if (p.turn_id) t.itemIds.push(p.turn_id);
      return;
    }
    if (line.type !== 'response_item') return;
    if (p.type === 'message') {
      if (p.role === 'user') {
        const text = userPartText(p.content); // injected <tag> / AGENTS.md blocks dropped
        if (text.trim()) {
          if (!this.firstQuestion) this.firstQuestion = text.trim();
          const t = this.ensure();
          if (!t.at && line.timestamp) t.at = line.timestamp;
          t.question = t.question ? `${t.question}\n\n${text}` : text;
        }
      } else if (p.role === 'assistant') {
        const text = partText(p.content);
        if (text.trim()) {
          const t = this.ensure();
          t.response = t.response ? `${t.response}\n\n${text}` : text;
        }
      }
      // role=developer: runner boilerplate, dropped
    } else if ((p.type === 'function_call' || p.type === 'custom_tool_call') && p.call_id && p.name) {
      const raw = String(p.arguments ?? p.input ?? '');
      const op = toolOpOf(p.name);
      const call = clip(raw, op === 'edit' || op === 'write' ? ARTIFACT_CALL_LIMIT : TOOL_CALL_LIMIT);
      // apply_patch names its files in the header; view_image names one in
      // its JSON arguments — both structured, neither guessed from a shell line
      const viewed = op === 'read' ? (() => { try { const a = JSON.parse(raw) as { path?: string }; return typeof a.path === 'string' && a.path ? [a.path] : []; } catch { return []; } })() : [];
      this.pendingCalls.set(p.call_id, { name: p.name, call: call.text, paths: op === 'edit' ? patchPaths(raw) : viewed, op });
    } else if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && p.call_id) {
      const reg = this.pendingCalls.get(p.call_id);
      if (reg) {
        const t = this.ensure();
        const res = clip(outputText(p.output), TOOL_RESULT_LIMIT);
        t.tools.push({
          name: reg.name, call: reg.call, result: res.text, truncated: res.truncated,
          ...(reg.paths.length ? { paths: reg.paths } : {}), op: reg.op, nativeCallId: p.call_id,
        });
        this.pendingCalls.delete(p.call_id);
      }
    }
  }

  finish(): { sessionId: string; title: string; turns: CodexTurn[]; subagent: boolean; cwd?: string } | null {
    this.flush();
    if (!this.sessionId || !this.sawItems) return null;
    // A segment without a question is not a turn — it is the previous
    // answer's tool machinery, split off by an intermediate
    // turn_context / task_started scheduling marker. Fold it back in:
    // the canvas shows turns of the CONVERSATION, not the runner's
    // scheduling. A compaction mark on a folded segment survives by
    // moving onto the next real turn; a leading orphan (nothing to fold
    // into) stays as it is.
    const folded: CodexTurn[] = [];
    let carriedCompaction: string | undefined;
    for (const turn of this.turns) {
      const prev = folded[folded.length - 1];
      if (!turn.question.trim() && prev) {
        if (turn.compactionBefore) carriedCompaction = carriedCompaction ?? turn.compactionBefore;
        if (turn.response) prev.response = prev.response ? `${prev.response}\n\n${turn.response}` : turn.response;
        prev.tools.push(...turn.tools);
        prev.itemIds.push(...turn.itemIds);
      } else {
        if (carriedCompaction && !turn.compactionBefore) turn.compactionBefore = carriedCompaction;
        carriedCompaction = undefined;
        folded.push(turn);
      }
    }
    this.turns = folded;
    // the rollout file does NOT carry the thread's display name (that
    // lives in the app-server thread store) — the first real user prompt
    // is the closest honest stand-in
    const dir = this.cwd.split('/').filter(Boolean).pop();
    const title = this.firstQuestion?.split('\n')[0].slice(0, 60)
      || ['codex', dir, this.day].filter(Boolean).join(' · ');
    return { sessionId: this.sessionId, title, turns: dropSelfCommandTurns(this.turns), subagent: !!this.parentThreadId, ...(this.cwd ? { cwd: this.cwd } : {}) };
  }

  toConversation(): ImportableConversation | null {
    const s = this.finish();
    if (!s || s.turns.length === 0) return null;
    return {
      title: s.title,
      messageCount: s.turns.length,
      source: 'codex',
      sessionId: s.sessionId,
      build: () => buildGraphFromTurns(s.turns, s.sessionId, s.cwd),
    };
  }
}

function collectFromText(text: string): CodexSessionCollector {
  const c = new CodexSessionCollector();
  for (const raw of text.split('\n')) c.feedLine(raw);
  return c;
}

export function buildGraphFromTurns(turns: CodexTurn[], sessionId: string, cwd?: string): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const origin = cwd ? { cwd } : {};
  // faithful projection: EVERY turn imports — no tail cap (see the Claude
  // Code adapter for the rationale; the rule is runner-agnostic).
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;

  for (const turn of turns) {
    // annotation, not chain link — see the Claude Code adapter's note
    let noteToWire: ThoughtNode | null = null;
    if (turn.compactionBefore) {
      const note = makeNode(turn.compactionBefore, '', false);
      note.data.stepKind = 'note';
      note.data.importSource = { runner: 'codex', sessionId, itemIds: [], ...origin };
      markImporterNote(note);
      nodes.push(note);
      noteToWire = note;
    }
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, prev === null);
    node.data.importSource = { runner: 'codex', sessionId, itemIds: turn.itemIds, ...origin };
    node.data.source = { question: node.data.question, response: node.data.response };
    node.data.attachments = toolAttachments(turn);
    seedPlaque(node);
    nodes.push(node);
    if (prev) edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    if (noteToWire) edges.push({ id: generateId(), source: noteToWire.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
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
  const s = collectFromText(text).finish();
  if (!s) return null;
  return turnsToBranch(s.turns, s.sessionId, 'codex', anchorNode, s.cwd);
}

/** The importable-conversation wrapper the import modal consumes. */
export function codexSessionConversation(text: string): ImportableConversation | null {
  return collectFromText(text).toConversation();
}
