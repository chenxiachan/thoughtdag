// The event contract — the one thing every reader of session history
// depends on. Adapters emit these; the fact index is reduced from them;
// why / recall / Session Atlas / the canvas mirror are projections over
// them. Nothing here names a runner's log field: that vocabulary stays
// inside the adapters. Facts only — interpretation lives in its own
// cache with its own labels.
//
// Versioned by shape: change a field, bump EVENT_SCHEMA and the fixtures
// under cli/test decide whether the change was allowed.

export const EVENT_SCHEMA = 'thoughtdag.events/1';

/** Was this seen, rebuilt, or guessed — and is it the whole thing? Two
 *  axes on purpose: a diff's first differing line is observed AND partial. */
export type Basis = 'observed' | 'reconstructed' | 'inferred';
export type Completeness = 'full' | 'partial' | 'unknown';
export interface Evidence { basis: Basis; completeness: Completeness }

/** Where a fact came from, precisely enough to read the verbatim source
 *  again. `ref` is the runner's own id for the record (message uuid,
 *  call id, turn id) or a line number when that is all there is. */
export interface SourcePointer {
  runner: string;
  file: string;
  ref: string;
  schema: string;
  hash?: string;
}

/** Canonical artifact identity, by scheme:
 *    file:///abs/path            a file on this machine (canonical path)
 *    https://…                   a web resource, exactly as fetched
 *    arxiv:2401.12345            a paper id, exactly as written by a tool
 *    thoughtdag:attachment/<id>  a canvas attachment
 *  A page, a quote, a byte range are LOCATORS on an artifact, never new
 *  artifacts. Titles, paraphrased URLs and unrecoverable citations are not
 *  artifacts at all. */
export type ArtifactId = string;
/** Where inside an artifact — exactly as the tool asked for it. */
export interface Locator {
  /** PDF pages as written ("3" or "1-5") */
  pages?: string;
  /** 1-based line range of a text read */
  lines?: [number, number];
  quote?: string;
}
export interface ArtifactRef { id: ArtifactId; observedPath?: string; locator?: Locator }

export type ToolOp = 'read' | 'write' | 'edit' | 'run' | 'search' | 'fetch' | 'agent' | 'other' | 'unknown';

export type EventKind =
  | 'session.started'
  | 'turn.started'
  | 'message.recorded'
  | 'tool.called'
  | 'tool.completed'
  | 'boundary.compaction'
  | 'context.committed';

export interface EventBase extends Evidence {
  /** stable across rebuilds: derived from the runner's own ids, never from position alone */
  id: string;
  kind: EventKind;
  /** namespaced: `<runner>:<native id>`; a subagent's own file names itself */
  sessionId: string;
  /** stable turn identity; absent on session-level events (never -1) */
  turnId?: string;
  /** display order only */
  turnIndex?: number;
  stepId?: string;
  at?: string;
  source: SourcePointer;
}

export interface SessionStarted extends EventBase {
  kind: 'session.started';
  runner: string;
  nativeId: string;
  /** the source file this fragment came from — one logical session can
      span several (a resumed Codex thread opens a new rollout each time) */
  sourceId: string;
  title: string;
  cwd?: string;
  workspace?: string;
  parentSessionId?: string;
  subagent?: boolean;
}

export interface TurnStarted extends EventBase {
  kind: 'turn.started';
  turnId: string;
  turnIndex: number;
  /** the turn this one continues from when the runner records a tree (a rewind forks it) */
  parentTurnId?: string;
  /** false when a runner or plugin opened the turn (a task notification, an injected message) */
  humanAuthored: boolean;
}

export interface MessageRecorded extends EventBase {
  kind: 'message.recorded';
  turnId: string;
  role: 'user' | 'assistant' | 'system' | 'custom';
  actor: 'human' | 'model' | 'plugin' | 'runner' | 'unknown';
  /** did the model see it — true for conversation, false for UI-only, unknown when the log does not say */
  modelVisible: true | false | 'unknown';
  /** verbatim head of the content; the whole thing is one SourcePointer away */
  excerpt: string;
  length: number;
}

export interface ToolCalled extends EventBase {
  kind: 'tool.called';
  turnId: string;
  callId: string;
  name: string;
  op: ToolOp;
  artifacts: ArtifactRef[];
  excerpt: string;
  length: number;
  /** for edits and writes: the first line that actually changed (observed, partial) */
  change?: string;
}

export interface ToolCompleted extends EventBase {
  kind: 'tool.completed';
  turnId: string;
  calledEventId: string;
  excerpt: string;
  length: number;
  truncated: boolean;
}

export interface BoundaryCompaction extends EventBase {
  kind: 'boundary.compaction';
  summaryExcerpt?: string;
  /** which earlier records the summary replaced — by event, not by turn; absent when the log does not say */
  replacedEventRefs?: SourcePointer[];
}

/** What a request was actually built from — the alignment fact. Exact
 *  when ThoughtDAG compiled the request itself; unknown for a runner
 *  that does not expose its final payload. Never inferred. */
export interface ContextCommitted extends EventBase {
  kind: 'context.committed';
  requestId: string;
  members: { eventId?: string; nodeId?: string; artifact?: ArtifactRef }[];
  contentHash: string;
  decidedBy: 'user' | 'system' | 'model';
  confirmed: boolean;
}

export type CanonicalEvent =
  | SessionStarted | TurnStarted | MessageRecorded | ToolCalled | ToolCompleted | BoundaryCompaction | ContextCommitted;

/** What an adapter can and cannot know. Projections show these, they
 *  never pretend past them. */
export interface AdapterManifest {
  runner: string;
  schema: string;
  turns: Evidence;
  parenting: Evidence;
  messages: Evidence;
  toolPairing: Evidence;
  artifactTouch: Evidence;
  compaction: Evidence;
  contextSurface: Evidence;
}

/** A derived edge — reduced from tool.called, never emitted by an adapter. */
export interface ArtifactTouch {
  artifact: ArtifactId;
  op: ToolOp;
  sessionId: string;
  turnId: string;
  turnIndex: number;
  derivedFrom: string; // the tool.called event id
  change?: string;
  at?: string;
  /** every distinct place the turn looked inside the artifact */
  locators?: Locator[];
}
