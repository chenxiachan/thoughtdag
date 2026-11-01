import type { ThoughtNode, ThoughtEdge, Attachment, ToolOp } from '../../types';
import { makeNode } from '../import-chat';
import { autoLayout } from '../layout';
import { generateId } from '../../utils';
import { conclusionOf } from '../turn-insight';

// Shared projection pieces for runner session adapters. Every runner's
// collector reduces its native format to this Turn shape; everything
// downstream (branch building, plaques, tool attachments) is common.

export interface RunnerTool {
  name: string;
  call: string;
  result: string;
  truncated: boolean;
  /** files the call touched (absolute or repo-relative, as the runner wrote them) */
  paths?: string[];
  op?: ToolOp;
  /** the runner's own id for this call (tool_use.id, call_id) — the same
      id its result answers to; provenance that must survive normalization */
  nativeCallId?: string;
  /** a web resource the call fetched, exactly as requested */
  url?: string;
  /** where inside the file the call looked, as the runner wrote it */
  locator?: { pages?: string; lines?: [number, number] };
}

/** One run a turn delegated to a subagent: who ran, what it was asked, what came back — and its
 *  own tool calls when the child's transcript is on disk. Pi's subagent tool writes the whole thing
 *  into the parent's tool result (the child keeps no session); Claude Code and Codex keep the child's
 *  transcript in a file of its own, adopted by the parent (see `SubagentSession`). */
export interface SubagentRun {
  /** the agent's name in the runner's own words (Pi: the agent definition; Claude Code: subagent_type) */
  agent: string;
  task: string;
  output: string;
  tools?: RunnerTool[];
  /** ids that survive a re-import: the call id (plus the child session's id once adopted) */
  itemIds: string[];
  at?: string;
  /** the text the child's own transcript opens with, for pairing it with its file */
  match?: string;
}

/** A subagent's transcript on disk, offered to its parent conversation before the parent builds. */
export interface SubagentSession {
  runner: 'claude-code' | 'codex';
  sessionId: string;
  firstQuestion: string;
  turns: RunnerTurn[];
  cwd?: string;
  /** when the child started (its first turn, or its header) */
  at?: string;
}

export interface RunnerTurn {
  question: string;
  response: string;
  itemIds: string[];
  tools: RunnerTool[];
  /** ISO timestamp of the turn's opening message, when the runner wrote one */
  at?: string;
  /** the runs this turn delegated, in call order */
  subagents?: SubagentRun[];
  /** the thinking the turn spent, counted (estimated from its text, or the
      runner's own count where the text is encrypted); the text is not kept */
  reasoningTokens?: number;
}

// Tool names → what they DID. Deterministic, runner-neutral: the same
// table classifies a Claude Code `Edit` and a Codex `apply_patch`.
const TOOL_OPS: [RegExp, ToolOp][] = [
  [/^(Read|NotebookRead|read_file|view_image)$/i, 'read'],
  [/^(Write|write_file)$/i, 'write'],
  [/^(Edit|MultiEdit|NotebookEdit|apply_patch)$/i, 'edit'],
  [/^(Bash|BashOutput|Shell|exec_command|local_shell|write_stdin)$/i, 'run'],
  [/^(Grep|Glob|LS|Search|WebSearch|web_search)$/i, 'search'],
  [/^(WebFetch|Fetch)$/i, 'fetch'],
  [/^(Task|Agent)$/i, 'agent'],
];

export function toolOpOf(name: string): ToolOp {
  return TOOL_OPS.find(([re]) => re.test(name))?.[1] ?? 'other';
}

/** Artifact-producing calls (a Write's whole file, an Edit's diff) keep
 *  their full text: that IS what the model saw and what the turn produced.
 *  Everything else clips to a readable head. */
export const TOOL_CALL_LIMIT = 800;
export const ARTIFACT_CALL_LIMIT = 32000;
export const TOOL_RESULT_LIMIT = 4000;

export const clipText = (s: string, limit: number): { text: string; truncated: boolean } =>
  s.length > limit ? { text: `${s.slice(0, limit)}\n…[truncated, ${s.length} chars total]`, truncated: true } : { text: s, truncated: false };

// The one turn we do NOT project faithfully: ThoughtDAG's own entry command.
// A turn that says "send this session to ThoughtDAG" is self-referential
// noise on the canvas, not conversation. Claude Code marks command turns
// structurally; the Codex prompt/skill text carries our sentinel line.
// Every OTHER slash command stays — faithful projection is the rule,
// self-reference is the only exception.
const SELF_MARKS = ['<command-name>/thoughtdag</command-name>', '[[thoughtdag:command]]'];

export function dropSelfCommandTurns<T extends { question: string }>(turns: T[]): T[] {
  return turns.filter((t) => !SELF_MARKS.some((m) => t.question.includes(m)));
}

/** Importer-owned notes are placed by autoLayout itself (Pass 5) — the
 *  one width hint they need travels on the node. */
export function markImporterNote(note: ThoughtNode): void {
  note.width = 460;
}

/** The plaque an imported turn wears when zoomed out, and the line its
 *  collapsed card shows: the answer's CONCLUSION. An agent opens with
 *  "let me look at…" and closes with what it found — the reader looking
 *  back needs the close. */
export function seedPlaque(node: ThoughtNode): void {
  const line = conclusionOf(node.data.response, 90);
  if (line) node.data.summaries = [line];
}

export function toolAttachments(turn: Pick<RunnerTurn, 'tools'>): Attachment[] {
  return turn.tools.map((tool): Attachment => ({
    id: generateId(),
    name: `tool: ${tool.name}${tool.truncated ? ' (truncated)' : ''}`,
    type: 'text/plain',
    size: tool.call.length + tool.result.length,
    content: `[call] ${tool.call}\n[result]\n${tool.result}`,
    ...(tool.paths?.length ? { paths: tool.paths } : {}),
    ...(tool.op ? { op: tool.op } : {}),
  }));
}

/** A turn's work on its node: the tool steps as attachments, left out of
 *  downstream context until the person turns them on (an agent's tool
 *  traffic runs many times its answer; the files it touched still travel
 *  as one pointer line), and the thinking it spent, as a count. */
export function seatTurnWork(node: ThoughtNode, turn: Pick<RunnerTurn, 'tools' | 'reasoningTokens'>): void {
  node.data.attachments = toolAttachments(turn);
  node.data.excludedAttachmentIds = node.data.attachments.map((a) => a.id);
  if (turn.reasoningTokens) node.data.reasoningTokens = [turn.reasoningTokens];
}

/** The harvest half, runner-agnostic: a SHORT experiment session becomes a
 *  branch hanging off the node it was compiled from, laid out beside the
 *  anchor — the user's canvas arrangement is never touched. */
/** Pair a turn's delegated runs with the child transcripts on disk: a run whose `match` text opens
 *  a child session takes that child's tool footprint (and its answer, when the parent's result was
 *  empty); a child nobody asked for by text falls to the last turn that started before it. */
export function adoptSubagentSessions(turns: RunnerTurn[], subs: SubagentSession[]): void {
  const used = new Set<SubagentSession>();
  const settle = (run: SubagentRun, sub: SubagentSession) => {
    used.add(sub);
    const tools = sub.turns.flatMap((t) => t.tools);
    if (tools.length) run.tools = tools;
    if (!run.output.trim()) run.output = sub.turns.map((t) => t.response).filter((r) => r.trim()).at(-1) ?? '';
    if (!run.itemIds.includes(sub.sessionId)) run.itemIds.push(sub.sessionId);
    if (!run.at && sub.at) run.at = sub.at;
  };
  for (const turn of turns) for (const run of turn.subagents ?? []) {
    const key = run.match?.trim();
    if (!key) continue;
    const sub = subs.find((x) => !used.has(x) && x.firstQuestion.trim() === key);
    if (sub) settle(run, sub);
  }
  for (const sub of subs) {
    if (used.has(sub) || !sub.at) continue;
    const before = turns.filter((t) => t.at && t.at <= sub.at!);
    const turn = before.at(-1) ?? turns.at(-1);
    if (!turn) continue;
    const run: SubagentRun = { agent: sub.runner, task: sub.firstQuestion, output: '', itemIds: [sub.sessionId], at: sub.at };
    settle(run, sub);
    (turn.subagents ??= []).push(run);
  }
}

/** The runs a turn delegated, as branch nodes off the turn's node: each child is a Q/A of its own
 *  (the task, the agent's answer, its tool footprint), on a branch edge like the canvas's own fan-out,
 *  so the layout keeps the next turn in the main column and puts the children beside. Children go
 *  into `nodes` right after their parent, so a re-import counts them in the same order. */
export function attachSubagentBranches(
  parent: ThoughtNode,
  turn: { itemIds: string[]; subagents?: SubagentRun[] },
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  runner: string,
  sessionId: string,
  cwd?: string,
): ThoughtNode[] {
  const kids: ThoughtNode[] = [];
  for (const run of turn.subagents ?? []) {
    const node = makeNode(`[${run.agent}] ${run.task}`.trim(), run.output, false);
    node.data.isBranch = true;
    node.data.importSource = { runner, sessionId, itemIds: run.itemIds, ...(cwd ? { cwd } : {}), subagent: { agent: run.agent, of: turn.itemIds[0] ?? '' } };
    node.data.source = { question: node.data.question, response: node.data.response };
    if (run.tools?.length) seatTurnWork(node, { tools: run.tools });
    seedPlaque(node);
    nodes.push(node);
    kids.push(node);
    edges.push({ id: generateId(), source: parent.id, target: node.id, type: 'smoothstep', data: { isBranchFromSelection: true, branchYRatio: 0.5 } } as ThoughtEdge);
  }
  return kids;
}

export function turnsToBranch(
  turns: RunnerTurn[],
  sessionId: string,
  runner: string,
  anchorNode: { id: string; x: number; y: number },
  cwd?: string,
): { nodes: ThoughtNode[]; edges: ThoughtEdge[]; turnCount: number } | null {
  if (turns.length === 0) return null;
  const nodes: ThoughtNode[] = [];
  const edges: ThoughtEdge[] = [];
  let prev: { id: string } = { id: anchorNode.id };
  for (const turn of turns) {
    const node = makeNode(turn.question || '(tool-only turn)', turn.response, false);
    node.data.importSource = { runner, sessionId, itemIds: turn.itemIds, ...(cwd ? { cwd } : {}) };
    node.data.source = { question: node.data.question, response: node.data.response };
    seatTurnWork(node, turn);
    seedPlaque(node);
    if (nodes.length === 0) node.data.isBranch = true; // the experiment forks off sideways
    nodes.push(node);
    edges.push({ id: generateId(), source: prev.id, target: node.id, type: 'smoothstep' } as ThoughtEdge);
    attachSubagentBranches(node, turn, nodes, edges, runner, sessionId, cwd);
    prev = node;
  }
  const laid = autoLayout(nodes, edges.filter((e) => e.source !== anchorNode.id));
  const minX = Math.min(...laid.map((n) => n.position.x));
  const minY = Math.min(...laid.map((n) => n.position.y));
  for (const n of laid) {
    n.position = { x: n.position.x - minX + anchorNode.x + 560, y: n.position.y - minY + anchorNode.y };
  }
  return { nodes: laid, edges, turnCount: turns.length };
}

// Tool ARGUMENTS share one vocabulary across runners — file_path, content,
// old_string / new_string, offset / limit, pages, url — whether the host is
// Claude Code or DSH (top-level calls and run_code dispatches alike). These
// read that vocabulary; nothing here guesses from free text.
export interface ToolInput {
  file_path?: string; notebook_path?: string; content?: string; old_string?: string; new_string?: string; replace_all?: boolean;
  url?: string; offset?: number; limit?: number; pages?: string;
}

/** What the call fetched (WebFetch) and where it looked inside a file
 *  (Read offset/limit, PDF pages) — structured fields only. */
export function toolScope(input: unknown): { url?: string; locator?: RunnerTool['locator'] } {
  const i = (input ?? {}) as ToolInput;
  const out: { url?: string; locator?: RunnerTool['locator'] } = {};
  if (typeof i.url === 'string' && /^https?:\/\//.test(i.url)) out.url = i.url;
  const loc: NonNullable<RunnerTool['locator']> = {};
  if (typeof i.pages === 'string' && i.pages.trim()) loc.pages = i.pages.trim();
  if (typeof i.offset === 'number' || typeof i.limit === 'number') {
    const start = Math.max(1, typeof i.offset === 'number' ? i.offset : 1);
    const end = typeof i.limit === 'number' ? start + Math.max(0, i.limit) - 1 : start;
    loc.lines = [start, Math.max(start, end)];
  }
  if (Object.keys(loc).length) out.locator = loc;
  return out;
}

/** The files a call touched, read straight off its input — never guessed
 *  from free text. */
export function toolPaths(input: unknown): string[] {
  const i = (input ?? {}) as ToolInput;
  const p = i.file_path ?? i.notebook_path;
  return typeof p === 'string' && p ? [p] : [];
}

/** The call as the reader should see it: a Write shows its file, an Edit
 *  its diff — not a JSON-escaped blob. Other tools keep their raw input. */
export function renderCall(name: string, input: unknown): string {
  const i = (input ?? {}) as ToolInput;
  const op = toolOpOf(name);
  if (op === 'write' && typeof i.content === 'string') return `${i.file_path ?? ''}\n\n${i.content}`;
  if (op === 'edit' && typeof i.new_string === 'string') {
    return `${i.file_path ?? i.notebook_path ?? ''}${i.replace_all ? ' (replace all)' : ''}\n--- old\n${i.old_string ?? ''}\n+++ new\n${i.new_string}`;
  }
  return JSON.stringify(input ?? {});
}

