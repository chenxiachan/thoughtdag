import type { ThoughtNode, ThoughtEdge } from '../../types';
import { makeNode, type ImportableConversation } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId, countTokens } from '../../utils';
import { toolScope, toolPaths, renderCall,
  turnsToBranch, seedPlaque, seatTurnWork, dropSelfCommandTurns, markImporterNote, toolOpOf, clipText,
  TOOL_CALL_LIMIT, ARTIFACT_CALL_LIMIT, TOOL_RESULT_LIMIT, type RunnerTool, attachSubagentBranches, adoptSubagentSessions, type SubagentRun, type SubagentSession
} from './shared';

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
//   - `thinking` blocks are counted, not kept: the canvas never forwards
//     thinking downstream (whether the runner carries it into its own later
//     turns depends on the model), so the turn keeps how much it spent.
//     The file holds a summary of the thinking, a fraction of what was
//     generated (about a fifth, measured on local logs 2026-10-27); the
//     billed output is whole, so a message's thinking is its output beyond
//     what it visibly wrote, and the summary text counts only where a line
//     carries no usage.
//   - Sidechain lines: a MAIN session file skips them (older runners inlined
//     subagent traffic there); a subagent's OWN file is sidechain top to
//     bottom and parses as a session in its own right, named by agentId —
//     its sessionId field points at the parent, and taking that as identity
//     would let the parent's canvas adopt the subagent's turns.
//   - A task notification (the runner delivering a subagent's report) rides
//     a user line but nobody typed it: it folds into the turn in progress as
//     an arrival, never a question of its own.
//   - A compaction boundary becomes a [Note] node wired into the next
//     turn: the source model's history was truncated there, and an honest
//     projection keeps that visible and prunable.
//   - Sessions can carry thousands of turns; only the most recent
//     MAX_TURNS import, and a [Note] node says so out loud.
// The source session file is never written — read-only by contract.

// a subagent's report is the one payload of a turn worth keeping whole
const NOTIFICATION_LIMIT = 16000;

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
  parentUuid?: string | null;
  sessionId?: string;
  cwd?: string;
  isSidechain?: boolean;
  agentId?: string;
  customTitle?: string;
  summary?: string;
  slug?: string;
  timestamp?: string;
  compactMetadata?: { preTokens?: number; postTokens?: number };
  message?: {
    id?: string;
    role?: string;
    content?: string | ContentPart[];
    usage?: { output_tokens?: number };
  };
}

interface Turn {
  question: string;
  response: string;
  itemIds: string[];
  /** parentUuid of the turn's opening user message. CC sessions are a
      TREE (Esc-rewind forks them); this anchor lets the graph builder
      hang the turn off its REAL parent turn instead of whatever came
      before it in the file. */
  parentItemId?: string;
  tools: RunnerTool[];
  at?: string;
  compactionBefore?: string; // note text for a compaction boundary preceding this turn
  /** the subagents this turn launched (Agent / Task tool calls), in call order */
  subagents?: SubagentRun[];
  reasoningTokens?: number;
  /** per assistant message: billed output, what it visibly wrote, its thinking summary */
  spend?: Map<string, { out: number; visible: number; summary: number }>;
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

const clip = clipText;

/** Streaming turn collector — mirror of the Codex one: lines in one at a
 *  time (no path may hold a whole multi-hundred-MB session as text),
 *  turns accumulate small. String entry points below are thin wrappers. */
export class ClaudeSessionCollector {
  private turns: Turn[] = [];
  // tool_use id → registration, so results pair up even across lines
  private pendingTools = new Map<string, { name: string; call: string; paths: string[]; op: RunnerTool['op']; url?: string; locator?: RunnerTool['locator']; spawn?: { agent: string; task: string; prompt: string } }>();
  private current: Turn | null = null;
  private pendingCompaction: string | undefined;
  private sessionId: string | null = null;
  private customTitle: string | null = null;
  private summary: string | null = null;
  private slug: string | null = null;
  private firstQuestion: string | null = null;
  private cwd: string | null = null;
  // decided by the first message line: what kind of file this is
  private mode: 'main' | 'sidechain' | null = null;

  feedLine(raw: string): void {
    const t = raw.trim();
    if (!t) return;
    let line: SessionLine;
    try { line = JSON.parse(t) as SessionLine; } catch { return; }
    this.feed(line);
  }

  private flush(): void {
    const c = this.current;
    if (c?.spend) {
      let think = 0;
      for (const m of c.spend.values()) think += m.out > 0 ? Math.max(0, m.out - m.visible) : m.summary;
      if (think > 0) c.reasoningTokens = think;
      delete c.spend;
    }
    if (c && (c.question || c.response || c.tools.length)) this.turns.push(c);
    this.current = null;
  }

  private feed(line: SessionLine): void {
    if (line.type === 'custom-title' && line.customTitle) this.customTitle = line.customTitle;
    if (line.type === 'summary' && line.summary && !this.summary) this.summary = line.summary;
    if (line.slug && !this.slug) this.slug = line.slug;
    if (line.cwd && !this.cwd) this.cwd = line.cwd;
    if (this.mode === null && (line.type === 'user' || line.type === 'assistant') && line.uuid) {
      this.mode = line.isSidechain && line.agentId ? 'sidechain' : 'main';
      if (this.mode === 'sidechain') this.sessionId = line.agentId!;
    }
    if (!!line.isSidechain !== (this.mode === 'sidechain')) return;

    if (line.type === 'system' && line.subtype === 'compact_boundary') {
      this.flush();
      const m = line.compactMetadata;
      this.pendingCompaction = `[Compaction] The source runner compacted its history here${
        m?.preTokens ? ` (${m.preTokens} → ${m.postTokens ?? '?'} tokens)` : ''
      }. Everything above this point reached later turns only as a summary.`;
      return;
    }

    if ((line.type === 'user' || line.type === 'assistant') && line.uuid && line.sessionId && !this.sessionId) {
      this.sessionId = line.sessionId;
    }

    if (line.type === 'user') {
      const content = line.message?.content;
      // tool results ride user lines — pair them with their pending call
      if (Array.isArray(content)) {
        for (const p of content) {
          if (p.type === 'tool_result' && p.tool_use_id) {
            const reg = this.pendingTools.get(p.tool_use_id);
            if (reg && this.current) {
              const res = clip(resultText(p.content), TOOL_RESULT_LIMIT);
              this.current.tools.push({
                name: reg.name, call: reg.call, result: res.text, truncated: res.truncated,
                ...(reg.paths.length ? { paths: reg.paths } : {}), op: reg.op, nativeCallId: p.tool_use_id,
                ...(reg.url ? { url: reg.url } : {}), ...(reg.locator ? { locator: reg.locator } : {}),
              });
              if (reg.spawn) {
                const report = clip(resultText(p.content), ARTIFACT_CALL_LIMIT);
                (this.current.subagents ??= []).push({ agent: reg.spawn.agent, task: reg.spawn.task, output: report.text, itemIds: [p.tool_use_id], match: reg.spawn.prompt, ...(line.timestamp ? { at: line.timestamp } : {}) });
              }
              this.pendingTools.delete(p.tool_use_id);
            }
          }
        }
      }
      const text = textParts(content);
      if (!text.trim()) return;
      if (/^\s*<task-notification>/.test(text)) {
        if (this.current) {
          const res = clip(text, NOTIFICATION_LIMIT);
          this.current.tools.push({ name: 'Agent', call: '(task notification)', result: res.text, truncated: res.truncated, op: 'agent' });
        }
        return;
      }
      {
        this.flush();
        if (!this.firstQuestion) this.firstQuestion = text.trim();
        this.current = {
          question: text, response: '', itemIds: line.uuid ? [line.uuid] : [], tools: [],
          parentItemId: line.parentUuid ?? undefined,
          ...(line.timestamp ? { at: line.timestamp } : {}),
        };
        if (this.pendingCompaction) {
          this.current.compactionBefore = this.pendingCompaction;
          this.pendingCompaction = undefined;
        }
      }
      return;
    }

    if (line.type === 'assistant' && this.current) {
      if (line.uuid) this.current.itemIds.push(line.uuid);
      const content = line.message?.content;
      const text = textParts(content);
      if (text.trim()) this.current.response = this.current.response ? `${this.current.response}\n\n${text}` : text;
      // one message arrives over several lines, each repeating its usage
      const msgId = line.message?.id ?? line.uuid;
      const spend = msgId ? ((this.current.spend ??= new Map()).get(msgId) ?? { out: 0, visible: 0, summary: 0 }) : null;
      if (spend && msgId) {
        spend.out = Math.max(spend.out, line.message?.usage?.output_tokens ?? 0);
        this.current.spend!.set(msgId, spend);
      }
      if (Array.isArray(content)) {
        for (const p of content) {
          if (spend) {
            if (p.type === 'thinking' && p.thinking) spend.summary += countTokens(p.thinking);
            else if (p.type === 'text' && p.text) spend.visible += countTokens(p.text);
            else if (p.type === 'tool_use') spend.visible += countTokens(JSON.stringify(p.input ?? {})) + 8;
          }
          if (p.type === 'tool_use' && p.id && p.name) {
            const op = toolOpOf(p.name);
            const call = clip(renderCall(p.name, p.input), op === 'write' || op === 'edit' ? ARTIFACT_CALL_LIMIT : TOOL_CALL_LIMIT);
            // an Agent (once Task) call launches a subagent: its type is the agent, its description the task,
            // its prompt the text the child's own transcript opens with
            const inp = (p.input && typeof p.input === 'object' ? p.input : {}) as { subagent_type?: string; description?: string; prompt?: string };
            const spawn = op === 'agent' ? { agent: String(inp.subagent_type ?? 'agent'), task: String(inp.description ?? inp.prompt?.split('\n')[0] ?? ''), prompt: String(inp.prompt ?? '') } : undefined;
            this.pendingTools.set(p.id, { name: p.name, call: call.text, paths: toolPaths(p.input), op, ...toolScope(p.input), ...(spawn ? { spawn } : {}) });
          }
        }
      }
    }
  }

  finish(): { sessionId: string; title: string; turns: Turn[]; cwd?: string } | null {
    this.flush();
    if (!this.sessionId) return null;
    // The name people recognize: their own title, the runner's summary
    // line (continued sessions), else the first thing they asked. The
    // slug is a random three-word tag and comes last.
    const asked = this.firstQuestion?.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('<'))?.slice(0, 80) ?? null;
    const title = this.customTitle ?? this.summary ?? asked ?? this.slug ?? `session ${this.sessionId.slice(0, 8)}`;
    return { sessionId: this.sessionId, title, turns: dropSelfCommandTurns(this.turns), ...(this.cwd ? { cwd: this.cwd } : {}) };
  }

  toConversation(): ImportableConversation | null {
    const s = this.finish();
    if (!s || s.turns.length === 0) return null;
    return {
      title: s.title,
      messageCount: s.turns.length,
      source: 'claude-code',
      sessionId: s.sessionId,
      build: () => buildGraphFromTurns(s.turns, s.sessionId, s.cwd),
      adopt: (subs) => adoptSubagentSessions(s.turns, subs),
    };
  }

  /** This file as a subagent's transcript (a sidechain file), for its parent to adopt. */
  toSubagentSession(): SubagentSession | null {
    const s = this.finish();
    if (!s || s.turns.length === 0 || this.mode !== 'sidechain') return null;
    const first = s.turns[0];
    return { runner: 'claude-code', sessionId: s.sessionId, firstQuestion: this.firstQuestion ?? first.question, turns: s.turns, ...(s.cwd ? { cwd: s.cwd } : {}), ...(first.at ? { at: first.at } : {}) };
  }
}

function collectFromText(text: string): ClaudeSessionCollector {
  const c = new ClaudeSessionCollector();
  for (const raw of text.split('\n')) c.feedLine(raw);
  return c;
}

function noteNode(text: string): ThoughtNode {
  // every canvas node is React Flow type 'thought'; stepKind dispatches
  const n = makeNode(text, '', false);
  n.data.stepKind = 'note';
  markImporterNote(n);
  return n;
}

function buildGraphFromTurns(turns: Turn[], sessionId: string, cwd?: string): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const origin = cwd ? { cwd } : {};
  // faithful projection: EVERY turn imports — no tail cap. Long sessions
  // stay navigable through the zoom tiers (map plaques, glyphs), and
  // pruning is the user's decision on the canvas, never the importer's.
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: ThoughtNode | null = null;
  // message uuid → the turn node that carries it: the tree's address book
  const byItem = new Map<string, ThoughtNode>();

  const link = (source: ThoughtNode, target: ThoughtNode) => {
    edges.push({ id: generateId(), source: source.id, target: target.id, type: 'smoothstep' } as ThoughtEdge);
  };

  for (const turn of turns) {
    // A compaction note ANNOTATES the chain, never joins it: layout skips
    // content nodes and their edges, so a note wired INTO the chain would
    // sever it — the second half restarts at the top and overlaps the
    // first. The main line stays turn→turn; the note points at the turn
    // it narrates from the side.
    let noteToWire: ThoughtNode | null = null;
    if (turn.compactionBefore) {
      const note = noteNode(turn.compactionBefore);
      // importer-owned notes carry provenance too, so "node without
      // importSource" strictly means "the user made this by hand"
      note.data.importSource = { runner: 'claude-code', sessionId, itemIds: [], ...origin };
      nodes.push(note);
      noteToWire = note;
    }
    const node = makeNode(turn.question, turn.response, prev === null);
    node.data.importSource = { runner: 'claude-code', sessionId, itemIds: turn.itemIds, ...origin };
    node.data.source = { question: node.data.question, response: node.data.response };
    seedPlaque(node);
    seatTurnWork(node, turn);
    nodes.push(node);
    attachSubagentBranches(node, turn, nodes, edges, 'claude-code', sessionId, cwd);
    // the REAL parent first (Esc-rewind forks the session tree; the
    // wire must fork with it — a line to the abandoned turn would put
    // dead context into the compiler). Fall back to file order when the
    // parent is unknown: a compaction summary, a sidechain, the root.
    const parent = turn.parentItemId ? byItem.get(turn.parentItemId) : undefined;
    if (parent) link(parent, node);
    else if (prev) link(prev, node);
    if (noteToWire) link(noteToWire, node);
    for (const id of turn.itemIds) byItem.set(id, node);
    prev = node;
  }

  return { nodes: autoLayout(nodes, edges), edges };
}

/** The harvest half of the experiment loop: a SHORT experiment session
 *  becomes a branch hanging off the node it was compiled from. The anchor
 *  line traveled inside the session's first user message; the caller has
 *  already resolved it to a live node. Returns the branch subgraph, laid
 *  out beside the anchor (never re-laying the user's canvas). */
export function claudeCodeSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  const s = collectFromText(text).finish();
  if (!s) return null;
  return turnsToBranch(s.turns, s.sessionId, 'claude-code', anchorNode, s.cwd);
}

/** The importable-conversation wrapper the existing import modal consumes. */
export function claudeCodeSessionConversation(text: string): ImportableConversation | null {
  return collectFromText(text).toConversation();
}
