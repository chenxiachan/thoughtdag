import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';
import {
  turnsToBranch, seedPlaque, toolAttachments, dropSelfCommandTurns, toolOpOf, clipText,
  ARTIFACT_CALL_LIMIT, TOOL_CALL_LIMIT, TOOL_RESULT_LIMIT, type RunnerTool,
} from './shared';

// DeepSeek Harness session importer — the continuity layer's READ
// direction for the DSH runner. A session lives as a zstd-compressed
// JSONL under ~/.dsh/sessions/<encoded-cwd>/<session-id>/session.jsonl.zstd
// (the desktop shell decompresses before this reader sees a line). Each
// line is ONE event; every event carries a monotonic seq, and turn/step
// boundaries ride explicit events (turn/start, step/start, step/end).
// The file is append-only: durable facts, never rewritten.
//
// Projection rules (v0, deliberately honest about what it drops):
//   - A TURN = one REAL user message plus everything the model did until
//     the next real user message → one Q/A node. "Real" is decided by the
//     event's source.kind: DSH INJECTS user-role messages for runtime
//     context snapshots (source.kind "plugin") and skill catalogs
//     ("skill-catalog") ahead of every turn. Those are runner template,
//     not conversation — same judgment as Codex developer messages — and
//     are dropped; only source.kind "user" opens a turn.
//   - The response = the assistant message's TEXT parts per step, folded
//     in order (a step that only reasons or calls tools adds no text).
//     reasoning parts are dropped: they never re-enter a next turn's
//     context in DSH either (same rule as the Claude Code adapter).
//   - Tool calls pair with their results by callId into atomic text
//     attachments on the turn's node (tool/call arguments + tool/result
//     text). tool/code-dispatch lines are the SAME root call observed at
//     the dispatch level (rootCallId = callId) — skipped, never a second
//     tool. Unknown event types are noise to this projector.
//   - The source session file is never written — read-only by contract.

interface DshPart { type?: string; text?: string }

interface DshUserMessage {
  type: 'user/message';
  seq: number;
  time?: number;
  data: {
    content?: DshPart[];
    source?: { kind?: string };
    id?: string;
  };
}

interface DshAssistantMessage {
  type: 'assistant/message';
  seq: number;
  time?: number;
  data: {
    turn: number;
    step: number;
    message: { content?: DshPart[]; id?: string };
  };
}

interface DshToolCall {
  type: 'tool/call';
  seq: number;
  time?: number;
  data: {
    turn: number;
    step: number;
    callId: string;
    name: string;
    arguments: string;
  };
}

interface DshToolResult {
  type: 'tool/result';
  seq: number;
  time?: number;
  data: {
    turn: number;
    step: number;
    message: { source?: { callId?: string }; content?: unknown };
  };
}

interface DshSessionLine {
  type?: string;
  id?: string;
  cwd?: string;
  seq?: number;
  time?: number;
  data?: {
    title?: string;
    source?: { kind?: string };
    content?: unknown;
    message?: { content?: unknown; source?: unknown; id?: string };
    callId?: string;
    name?: string;
    arguments?: string;
    turn?: number;
    step?: number;
  };
}

/** Text under a DSH message: content is an array of parts, text parts may
 *  nest one level deep inside tool-result blocks. Images become an honest
 *  marker, never base64 noise on a canvas card. */
function partsText(content: unknown, depth = 0): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || depth > 2) return '';
  return content.map((p) => {
    if (!p || typeof p !== 'object') return '';
    const o = p as DshPart;
    if (o.type === 'text' && typeof o.text === 'string') return o.text;
    if (o.type === 'image') return '[image omitted]';
    // reasoning never re-enters the model's own next context in DSH; it is
    // not the answer — drop it here, before the nested fallback below could
    // re-admit its `text` field as if it were a text part.
    if (o.type === 'reasoning') return '';
    return partsText(o.text ?? (o as { content?: unknown }).content, depth + 1);
  }).filter(Boolean).join('\n');
}

/** run_code carries the code it ran as a JSON string of {code,
 *  description} — render the CODE (that is what ran), any other tool
 *  keeps its raw JSON arguments. */
function renderCall(name: string, argumentsJson: string): { text: string; truncated: boolean } {
  const op = toolOpOf(name);
  if (op === 'run' || /^run_code$/i.test(name)) {
    try {
      const a = JSON.parse(argumentsJson) as { code?: string; description?: string };
      const body = typeof a.code === 'string' ? a.code : argumentsJson;
      return clipText(body, ARTIFACT_CALL_LIMIT);
    } catch { /* fall through to raw */ }
  }
  return clipText(argumentsJson, op === 'write' || op === 'edit' ? ARTIFACT_CALL_LIMIT : TOOL_CALL_LIMIT);
}

interface DshTurn {
  question: string;
  response: string;
  itemIds: string[];
  tools: RunnerTool[];
  at?: string;
}

/** Streaming turn collector — one line in at a time (a DSH session can
 *  run tens of thousands of events; no path may hold it whole). */
export class DshSessionCollector {
  private turns: DshTurn[] = [];
  private pendingTools = new Map<string, { name: string; call: string; truncated: boolean; op: RunnerTool['op'] }>();
  private current: DshTurn | null = null;
  private sessionId: string | null = null;
  private cwd: string | null = null;
  private title: string | null = null;
  private firstQuestion: string | null = null;

  feedLine(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    let line: DshSessionLine;
    try { line = JSON.parse(t) as DshSessionLine; } catch { return; }
    this.feed(line);
  }

  private flush(): void {
    const c = this.current;
    if (c && (c.question || c.response || c.tools.length)) this.turns.push(c);
    this.current = null;
  }

  private ensure(): DshTurn {
    if (!this.current) this.current = { question: '', response: '', itemIds: [], tools: [] };
    return this.current;
  }

  private feed(line: DshSessionLine): void {
    if (line.type === 'session' && line.id) {
      if (!this.sessionId) this.sessionId = line.id;
      if (line.cwd && !this.cwd) this.cwd = line.cwd;
      return;
    }
    if (line.type === 'session/title' && line.data?.title && !this.title) {
      this.title = line.data.title;
      return;
    }
    // The ONLY turn opener: a user-role message a human actually sent.
    // DSH prefixes each turn with plugin/skill-catalog injections that
    // also ride user/message events — those never open or append a turn.
    if (line.type === 'user/message') {
      const um = line as unknown as DshUserMessage;
      const kind = um.data?.source?.kind;
      if (kind && kind !== 'user') return;
      const text = partsText(um.data?.content).trim();
      if (!text) return;
      if (!this.firstQuestion) this.firstQuestion = text.split('\n')[0].slice(0, 80);
      this.flush();
      const t = this.ensure();
      t.question = text;
      t.itemIds = [um.data?.id ?? `u${um.seq}`];
      if (um.time) t.at = new Date(um.time).toISOString();
      return;
    }
    if (line.type === 'assistant/message' && this.current) {
      const am = line as unknown as DshAssistantMessage;
      const parts = am.data?.message?.content;
      const text = partsText(parts).trim();
      const id = am.data?.message?.id;
      if (id) this.current.itemIds.push(id);
      // text parts only; reasoning parts carry no 'text' under our reader
      if (text) this.current.response = this.current.response ? `${this.current.response}\n\n${text}` : text;
      return;
    }
    if (line.type === 'tool/call') {
      const tc = line as unknown as DshToolCall;
      if (!tc.data?.callId || !tc.data?.name) return;
      const op = /^run_code$/i.test(tc.data.name) ? 'run' : toolOpOf(tc.data.name);
      const call = renderCall(tc.data.name, tc.data.arguments ?? '');
      this.pendingTools.set(tc.data.callId, { name: tc.data.name, call: call.text, truncated: call.truncated, op });
      return;
    }
    if (line.type === 'tool/result') {
      const tr = line as unknown as DshToolResult;
      const callId = tr.data?.message?.source?.callId;
      if (!callId) return;
      const reg = this.pendingTools.get(callId);
      if (!reg) return;
      const res = clipText(partsText(tr.data?.message?.content), TOOL_RESULT_LIMIT);
      const t = this.ensure();
      t.tools.push({
        name: reg.name, call: reg.call, result: res.text, truncated: reg.truncated || res.truncated,
        op: reg.op, nativeCallId: callId,
      });
      this.pendingTools.delete(callId);
      return;
    }
    // turn/step boundaries, request/*, permission/preset, sandbox/mode,
    // approval/policy, agent-preset/selected, agent/inbox/spliced,
    // llm/retry, *-chunks… — scheduling or transport, not conversation.
  }

  finish(): { sessionId: string; title: string; turns: DshTurn[]; cwd?: string } | null {
    this.flush();
    if (!this.sessionId) return null;
    const asked = this.firstQuestion ?? null;
    const title = this.title ?? asked ?? `session ${this.sessionId.replace(/^session-/, '').slice(0, 8)}`;
    return { sessionId: this.sessionId, title, turns: dropSelfCommandTurns(this.turns), ...(this.cwd ? { cwd: this.cwd } : {}) };
  }

  toConversation(): ImportableConversation | null {
    const s = this.finish();
    if (!s || s.turns.length === 0) return null;
    return {
      title: s.title,
      messageCount: s.turns.length,
      source: 'dsh',
      sessionId: s.sessionId,
      build: () => buildGraphFromTurns(s.turns, s.sessionId, s.cwd),
    };
  }
}

function collectFromText(text: string): DshSessionCollector {
  const c = new DshSessionCollector();
  for (const raw of text.split('\n')) c.feedLine(raw);
  return c;
}

export function buildGraphFromTurns(turns: DshTurn[], sessionId: string, cwd?: string): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const origin = cwd ? { cwd } : {};
  // faithful projection: EVERY turn imports — no tail cap (see the Claude
  // Code adapter for the rationale; the rule is runner-agnostic).
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;

  for (const turn of turns) {
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, prev === null);
    node.data.importSource = { runner: 'dsh', sessionId, itemIds: turn.itemIds, ...origin };
    node.data.source = { question: node.data.question, response: node.data.response };
    node.data.attachments = toolAttachments(turn);
    seedPlaque(node);
    nodes.push(node);
    if (prev) edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    prev = node;
  }

  return { nodes: autoLayout(nodes, edges), edges };
}

/** Harvest: a short DSH experiment session hangs off the node it was
 *  compiled from — same runner-agnostic branch builder as the others. */
export function dshSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  const s = collectFromText(text).finish();
  if (!s) return null;
  return turnsToBranch(s.turns, s.sessionId, 'dsh', anchorNode, s.cwd);
}

/** The importable-conversation wrapper the import modal / canonical
 *  router consumes. */
export function dshSessionConversation(text: string): ImportableConversation | null {
  return collectFromText(text).toConversation();
}
