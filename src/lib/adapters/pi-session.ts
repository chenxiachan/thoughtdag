import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId, countTokens } from '../../utils';
import {
  turnsToBranch, seedPlaque, seatTurnWork, dropSelfCommandTurns, toolOpOf, clipText, attachSubagentBranches,
  ARTIFACT_CALL_LIMIT, TOOL_CALL_LIMIT, TOOL_RESULT_LIMIT, type RunnerTool, type SubagentRun,
} from './shared';

// Pi session importer — the continuity layer's READ direction for the Pi
// runner. A session is a JSONL under ~/.pi/agent/sessions/<encoded-cwd>/
// <timestamp>_<id>.jsonl (format version 3): a header line, then entries
// that each carry an id and a parentId. The session is a TREE — Pi forks
// natively (/tree, --fork) — so a turn hangs off the entry its question
// answered, not off whatever came before it in the file.
//
// Projection rules (v0, deliberately honest about what it drops):
//   - A TURN = one user message plus everything the model did until the
//     next user message → one Q/A node. Its parentItemId is the user
//     message's parentId, which may name an entry inside an earlier turn
//     (a branch) or a bookkeeping entry (model_change, thinking_level_change)
//     — those ride the turn they occur in, so the tree resolves through them.
//   - The response = the assistant messages' TEXT blocks, folded in order.
//     `thinking` blocks are counted, not kept: the canvas never forwards
//     thinking downstream (whether Pi's own later turns carry it depends
//     on the model it calls).
//   - Tool calls are `toolCall` blocks in assistant messages; results are
//     messages of role `toolResult` paired by toolCallId. A call that names
//     a file (read / edit / write take `path`) records it as its footprint.
//   - Compaction and other entry types are ignored by this projector; the
//     source file is never written — read-only by contract.

interface PiBlock { type?: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: unknown }

interface PiEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  version?: number;
  cwd?: string;
  message?: {
    role?: string;
    content?: PiBlock[] | string;
    toolCallId?: string;
    toolName?: string;
    timestamp?: number;
    usage?: { reasoning?: number };
    /** the tool's own structured result (the subagent tool: mode and per-agent results) */
    details?: unknown;
  };
}

interface PiToolArgs { path?: string; offset?: number; limit?: number; command?: string; content?: string; edits?: { oldText?: string; newText?: string }[]; oldText?: string; newText?: string; pattern?: string }

const textOf = (content: PiBlock[] | string | undefined): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n');
};

/** Pi's file tools take `path`; the call renders the way every runner's
 *  does — a write shows its file, an edit its diff — so the change head and
 *  the footprint come out the same as for Claude Code or Codex. */
function renderCall(name: string, args: unknown): { text: string; truncated: boolean; paths: string[]; locator?: RunnerTool['locator'] } {
  const a = (args && typeof args === 'object' ? args : {}) as PiToolArgs;
  const op = toolOpOf(name);
  const paths = typeof a.path === 'string' && a.path && (op === 'read' || op === 'edit' || op === 'write') ? [a.path] : [];
  let locator: RunnerTool['locator'];
  if (op === 'read' && (typeof a.offset === 'number' || typeof a.limit === 'number')) {
    const start = Math.max(1, typeof a.offset === 'number' ? a.offset : 1);
    const end = typeof a.limit === 'number' ? start + Math.max(0, a.limit) - 1 : start;
    locator = { lines: [start, Math.max(start, end)] };
  }
  if (op === 'write' && typeof a.content === 'string') {
    const c = clipText(`${a.path ?? ''}\n\n${a.content}`, ARTIFACT_CALL_LIMIT);
    return { ...c, paths };
  }
  if (op === 'edit') {
    const edits = Array.isArray(a.edits) ? a.edits : (typeof a.newText === 'string' ? [{ oldText: a.oldText, newText: a.newText }] : []);
    if (edits.length) {
      const body = edits.map((e) => `${a.path ?? ''}\n--- old\n${e.oldText ?? ''}\n+++ new\n${e.newText ?? ''}`).join('\n\n');
      const c = clipText(body, ARTIFACT_CALL_LIMIT);
      return { ...c, paths };
    }
  }
  if (op === 'run' && typeof a.command === 'string') { const c = clipText(a.command, TOOL_CALL_LIMIT); return { ...c, paths }; }
  const c = clipText(JSON.stringify(args ?? {}), TOOL_CALL_LIMIT);
  return { ...c, paths, ...(locator ? { locator } : {}) };
}

interface PiTurn {
  question: string;
  response: string;
  itemIds: string[];
  parentItemId?: string;
  tools: RunnerTool[];
  at?: string;
  subagents?: SubagentRun[];
  reasoningTokens?: number;
}

/** The runs a `subagent` tool call delegated (Pi's example extension: one agent, a parallel set,
 *  or a chain). The result's `details.results` carry each run whole — agent, task, its messages;
 *  without details, the call's own arguments say who was asked what and the result text is the
 *  answer (one run) or unknown per run (several). Each run's id is the call id plus its index. */
const finalOutput = (messages: unknown): string => {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: PiBlock[] | string } | null;
    if (m?.role === 'assistant') { const text = textOf(m.content).trim(); if (text) return text; }
  }
  return '';
};
function subagentRuns(args: unknown, content: PiBlock[] | string | undefined, details: unknown, callId: string): SubagentRun[] {
  const d = details as { results?: { agent?: string; task?: string; messages?: unknown; stderr?: string }[] } | null | undefined;
  if (Array.isArray(d?.results) && d.results.length) {
    return d.results.map((r, i) => ({ agent: String(r.agent ?? 'agent'), task: String(r.task ?? ''), output: finalOutput(r.messages) || String(r.stderr ?? '').trim(), itemIds: [`${callId}#${i}`] }));
  }
  const a = (args && typeof args === 'object' ? args : {}) as { agent?: string; task?: string; tasks?: { agent?: string; task?: string }[]; chain?: { agent?: string; task?: string }[] };
  const asked = Array.isArray(a.tasks) && a.tasks.length ? a.tasks : Array.isArray(a.chain) && a.chain.length ? a.chain : (a.agent || a.task) ? [{ agent: a.agent, task: a.task }] : [];
  const text = textOf(content).trim();
  return asked.map((x, i) => ({ agent: String(x.agent ?? 'agent'), task: String(x.task ?? ''), output: asked.length === 1 ? text : '', itemIds: [`${callId}#${i}`] }));
}

/** Streaming turn collector — one line in at a time. */
export class PiSessionCollector {
  private turns: PiTurn[] = [];
  private pending = new Map<string, { name: string; call: string; truncated: boolean; op: RunnerTool['op']; paths: string[]; locator?: RunnerTool['locator']; args?: unknown }>();
  private current: PiTurn | null = null;
  private sessionId: string | null = null;
  private cwd: string | null = null;
  private firstQuestion: string | null = null;

  feedLine(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    let e: PiEntry;
    try { e = JSON.parse(t) as PiEntry; } catch { return; }
    this.feed(e);
  }

  private flush(): void {
    const c = this.current;
    if (c && (c.question || c.response || c.tools.length)) this.turns.push(c);
    this.current = null;
  }

  private feed(e: PiEntry): void {
    if (e.type === 'session' && typeof e.id === 'string') {
      // a Pi header carries a string timestamp and format version ≥ 3; the
      // DSH header (also type "session") carries createdAt — the router keeps
      // them apart before this collector sees a line
      if (!this.sessionId) this.sessionId = e.id;
      if (typeof e.cwd === 'string' && !this.cwd) this.cwd = e.cwd;
      return;
    }
    if (e.type !== 'message') {
      // bookkeeping entries (model_change, thinking_level_change, …) sit on
      // the parent chain; the turn they occur in owns their id so a later
      // branch that names one still resolves to the right node
      if (this.current && typeof e.id === 'string') this.current.itemIds.push(e.id);
      return;
    }
    const m = e.message;
    if (!m) return;
    if (m.role === 'user') {
      const text = textOf(m.content).trim();
      if (!text) return;
      this.flush();
      if (!this.firstQuestion) this.firstQuestion = text.split('\n')[0].slice(0, 80);
      const at = typeof e.timestamp === 'string' ? e.timestamp : typeof m.timestamp === 'number' ? new Date(m.timestamp).toISOString() : undefined;
      this.current = {
        question: text, response: '', itemIds: typeof e.id === 'string' ? [e.id] : [], tools: [],
        ...(typeof e.parentId === 'string' ? { parentItemId: e.parentId } : {}), ...(at ? { at } : {}),
      };
      return;
    }
    if (m.role === 'assistant') {
      const cur = this.current ?? (this.current = { question: '', response: '', itemIds: [], tools: [] });
      if (typeof e.id === 'string') cur.itemIds.push(e.id);
      const text = textOf(m.content).trim();
      if (text) cur.response = cur.response ? `${cur.response}\n\n${text}` : text;
      // the provider's own reasoning count where Pi recorded one, else the thinking text
      const counted = typeof m.usage?.reasoning === 'number' && m.usage.reasoning > 0 ? m.usage.reasoning
        : Array.isArray(m.content) ? m.content.reduce((n, b) => n + (b?.type === 'thinking' && typeof b.thinking === 'string' ? countTokens(b.thinking) : 0), 0) : 0;
      if (counted) cur.reasoningTokens = (cur.reasoningTokens ?? 0) + counted;
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b?.type !== 'toolCall' || typeof b.id !== 'string' || typeof b.name !== 'string') continue;
          const r = renderCall(b.name, b.arguments);
          this.pending.set(b.id, { name: b.name, call: r.text, truncated: r.truncated, op: toolOpOf(b.name), paths: r.paths, ...(r.locator ? { locator: r.locator } : {}), ...(b.name === 'subagent' ? { args: b.arguments } : {}) });
        }
      }
      return;
    }
    if (m.role === 'toolResult') {
      const id = m.toolCallId;
      if (!id) return;
      const reg = this.pending.get(id);
      if (!reg) return;
      const cur = this.current ?? (this.current = { question: '', response: '', itemIds: [], tools: [] });
      if (typeof e.id === 'string') cur.itemIds.push(e.id);
      const res = clipText(textOf(m.content), TOOL_RESULT_LIMIT);
      cur.tools.push({
        name: reg.name, call: reg.call, result: res.text, truncated: reg.truncated || res.truncated,
        op: reg.op, nativeCallId: id,
        ...(reg.paths.length ? { paths: reg.paths } : {}), ...(reg.locator ? { locator: reg.locator } : {}),
      });
      if (reg.name === 'subagent') {
        const runs = subagentRuns(reg.args, m.content, m.details, id);
        if (runs.length) cur.subagents = [...(cur.subagents ?? []), ...runs];
      }
      this.pending.delete(id);
    }
  }

  finish(): { sessionId: string; title: string; turns: PiTurn[]; cwd?: string } | null {
    this.flush();
    if (!this.sessionId) return null;
    const title = this.firstQuestion ?? `session ${this.sessionId.slice(0, 8)}`;
    return { sessionId: this.sessionId, title, turns: dropSelfCommandTurns(this.turns), ...(this.cwd ? { cwd: this.cwd } : {}) };
  }

  toConversation(): ImportableConversation | null {
    const s = this.finish();
    if (!s || s.turns.length === 0) return null;
    return {
      title: s.title, messageCount: s.turns.length, source: 'pi', sessionId: s.sessionId,
      build: () => buildGraphFromTurns(s.turns, s.sessionId, s.cwd),
    };
  }
}

function collectFromText(text: string): PiSessionCollector {
  const c = new PiSessionCollector();
  for (const raw of text.split('\n')) c.feedLine(raw);
  return c;
}

/** Faithful projection: every turn imports, and each hangs off its REAL
 *  parent — the node holding the entry its question answered — so a Pi
 *  fork becomes a branch on the canvas. A parent the file never named
 *  (the root) falls back to file order. */
export function buildGraphFromTurns(turns: PiTurn[], sessionId: string, cwd?: string): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const origin = cwd ? { cwd } : {};
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  const byItem = new Map<string, ThoughtNode>();
  const link = (a: ThoughtNode, b: ThoughtNode) => edges.push({ id: generateId(), source: a.id, target: b.id, type: 'smoothstep' } as ThoughtEdge);
  let prev: ThoughtNode | null = null;
  for (const turn of turns) {
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, prev === null);
    node.data.importSource = { runner: 'pi', sessionId, itemIds: turn.itemIds, ...origin };
    node.data.source = { question: node.data.question, response: node.data.response };
    seatTurnWork(node, turn);
    seedPlaque(node);
    nodes.push(node);
    const parent = turn.parentItemId ? byItem.get(turn.parentItemId) : undefined;
    if (parent) link(parent, node);
    else if (prev) link(prev, node);
    attachSubagentBranches(node, turn, nodes, edges, 'pi', sessionId, cwd);
    for (const id of turn.itemIds) byItem.set(id, node);
    prev = node;
  }
  return { nodes: autoLayout(nodes, edges), edges };
}

/** Harvest: a short Pi experiment session hangs off the node it was compiled from. */
export function piSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  const s = collectFromText(text).finish();
  if (!s) return null;
  return turnsToBranch(s.turns, s.sessionId, 'pi', anchorNode, s.cwd);
}

/** The importable-conversation wrapper the import modal / canonical router consumes. */
export function piSessionConversation(text: string): ImportableConversation | null {
  return collectFromText(text).toConversation();
}
