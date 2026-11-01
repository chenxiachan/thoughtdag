import type { Node, Edge } from '@xyflow/react';

export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number;
  addedAt?: string; // ISO timestamp: when this material entered the canvas (thinking-timeline raw data)
  content: string; // base64 for images, raw text for text files; '' for vaulted PDFs
  /** Bulky payload lives in the attachment vault (IndexedDB), not here —
      read through loadAttachmentContent(). Exports inline it back. */
  contentInVault?: boolean;
  thumbnailUrl?: string; // data URL for image preview
  extractedText?: string; // companion text (PDF extraction / image auto-understanding)
  extractedBy?: string; // which model produced extractedText (extraction provenance)
  pageImages?: string[]; // rendered page images as base64 PNG (PDF)
  /** a notebook's figures, in output order — the image channel of a .ipynb
      (its extractedText names them [figure N]) */
  figures?: { data: string; mimeType: string }[];
  numPages?: number; // PDF page count
  renderMode?: 'full' | 'text-only'; // PDF, image or notebook: include the pictures or text only
  isExtracting?: boolean; // PDF extraction in progress
  digest?: string; // reader's guided digest (markdown, with (p.N) anchors)
  digestBy?: string; // model that wrote the digest
  /** Footprint of an imported tool call: the files it touched and what it
      did to them — the why layer's join key (path → the turns that touched
      it). Set by the session adapters, never by hand. */
  paths?: string[];
  op?: ToolOp;
}

/** What a tool call DID, classified from its name across runners. */
export type ToolOp = 'read' | 'write' | 'edit' | 'run' | 'search' | 'fetch' | 'agent' | 'other';

/** One word of a ladder's abstract; `space` when the source had whitespace after it. */
export interface LadderToken { t: string; space?: boolean }
/** A ladder level item: an index into the abstract's tokens, or a free-text word (a written level, or a local ladder's), carrying its trailing space. */
export type LadderItem = number | string;
/** Nested summaries for one answer version: topic ⊂ takeaway ⊂ brief (written by the model, seeing the thread) ⊂ abstract (sentences of the answer, verbatim). */
export interface Ladder {
  tokens: LadderToken[];
  /** the abstract: whole sentences of the answer, verbatim, in order */
  abstract: string;
  /** which sentences of the answer (by index in lib/ladder sentencesOf) */
  sentences: number[];
  brief: LadderItem[];
  takeaway: LadderItem[];
  topic: LadderItem[];
  /** the model that selected */
  model?: string;
  /** what the selection could see: the compiled conversation, the thread's own ladders, or this answer alone */
  context?: 'full' | 'thread' | 'none';
  /** the epistemic move the writing model saw (a judge may still decide the plaque's type) */
  move?: 'insight' | 'ruleout' | 'decision' | 'pivot' | 'open';
  /** the answer was judged a revision of its parent's (most sentences shared) */
  revision?: boolean;
}

export interface Highlight {
  id: string;
  text: string;
  at?: string; // ISO timestamp: when the user marked it (thinking-timeline raw data)
}

/** A web source the model consulted while generating a response. */
/** The agent runtimes the desktop shell can run a turn on. */
export type AgentRuntime = 'pi' | 'codex' | 'claude-code';

/** An agent runtime asking the person whether one action may proceed —
    shown on the node while the turn waits. */
export interface ApprovalRequest {
  id: string;
  /** what is being asked: a yes/no (the default), a pick, a line, a text, or
      a form of several questions answered together */
  kind?: 'confirm' | 'select' | 'input' | 'editor' | 'form';
  options?: string[];
  /** the form's questions (kind 'form') */
  questions?: FormQuestion[];
  placeholder?: string | null;
  prefill?: string | null;
  /** the tool the runtime is deciding about (its own name) */
  toolName: string;
  callId: string | null;
  /** the runtime's or a policy hook's human-readable reason */
  reason: string | null;
  /** the call as the canvas already shows it: tool name and its one-line query */
  name: string;
  query: string;
  /** the full arguments, serialized, when the runtime supplied them */
  arguments: string | null;
  askedAt: string;
  /** set the moment the person clicks, before the runtime confirms */
  answered?: ApprovalOutcome;
  /** where the answer goes: a desktop runtime's run, else the harness bridge */
  channel?: { runId: string };
  /** the paths outside the working directory this step reaches for */
  paths?: string[];
  /** a directory the person can allow from now on, instead of once */
  suggest?: string | null;
  /** what "allow for this conversation" would cover, as the runtime names it
      (opaque; a later turn with the same rule is allowed without asking).
      Absent when the runtime offers no standing allowance for this ask. */
  rule?: string | null;
  /** the runtime decided from a standing rule of this conversation; nobody was asked */
  auto?: boolean;
}

/** One question of an agent's form: options to pick (one, or several when
    `multiSelect`), each with an optional explanation, and a line of the
    person's own words where the runtime takes one. No options = text only. */
export interface FormQuestion {
  id: string;
  question: string;
  /** a short label above the question */
  header?: string;
  /** what the question is about at length, e.g. a plan under review */
  detail?: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
  /** the runtime accepts an answer in the person's own words */
  custom?: boolean;
  /** the answer is a secret (masked while typed, kept out of the record) */
  secret?: boolean;
}

/** The person's answer to one form question: the picked labels, and/or their own words. */
export interface FormAnswer {
  id: string;
  selected: string[];
  custom?: string;
}

/** How freely the agents a canvas starts may act: ask before risky steps,
    let the runtime's own review decide, or ask nothing. */
export type AgentPermissionMode = 'ask' | 'auto' | 'allow';

/** One tool call of a running agent turn, as the node shows it live. */
/** One thing recall brought into a node's context: a turn of some agent's
    session or an entry of a memory file, quoted verbatim (clipped), with its
    price and source. Excluded items stay listed but leave the prompt. */
export interface RecallItem {
  /** a dossier item: the topic's maintained document, brought in whole */
  dossier?: { topicId: string; name: string; updatedAt: string };
  id: string;
  kind: 'turn' | 'memory';
  runner: string;
  session: string;
  turn: number;
  title: string;
  at?: string;
  cwd: string;
  file: string;
  open: string;
  /** the words of the question that found it */
  matched: string[];
  text: string;
  tokens: number;
  excluded?: boolean;
  /** the judge's probability that this bears on the question, when a judge ranked the pool */
  relevance?: number;
  /** the condensed card a cheap model wrote for this turn (cached); the model reads it instead of the text */
  card?: string;
  cardTokens?: number;
  /** the topics this item was reached by (names), when recall matched by topic */
  topics?: string[];
}

/** How one recall ran: what it corrected, who ranked, how wide it looked. */
export interface RecallMeta {
  corrections: { from: string; to: string; p?: number }[];
  judge?: { provider: string; model: string; calibrated: boolean };
  judgeError?: string;
  /** candidates considered, and hits the index reported in total */
  pool: number;
  total: number;
  /** candidates the judge held irrelevant (below the floor) */
  dropped?: number;
  /** candidates the judge found only somewhat relevant, not brought in; one click brings them */
  heldBack?: { session: string; turn: number; relevance: number; open: string }[];
  /** the token budget this recall worked within */
  budget?: number;
  /** the topics the judge held the question to be about, whose turns joined the pool */
  topics?: { id: string; name: string; p: number }[];
  /** the judge's probability that the question asks for a specific detail (excerpts fetched) rather than an overview (dossier only) */
  detail?: number;
  /** the dossiers brought in, by topic name */
  dossiers?: string[];
  /** how far the search reached: the pool the judge saw was the 40 best hits, 2,000 hits, or every turn */
  reach?: 'light' | 'deep' | 'full';
}

export interface AgentTraceEntry {
  id: string;
  name: string;
  query: string;
  status: 'running' | 'ok' | 'error';
  startedAt: string;
  endedAt?: string;
}

export type ApprovalOutcome = 'allowed-once' | 'allowed-session' | 'rejected' | 'cancelled' | 'unavailable' | 'answered';

/** A decided approval: part of the turn's record, like a tool footprint. */
export interface ApprovalRecord extends ApprovalRequest {
  outcome: ApprovalOutcome;
  decidedAt: string;
  /** the pick or the text, for select/input/editor; a form's answers in one line */
  value?: string;
}

export interface Reference {
  title: string;
  url?: string;
  media?: string;
  date?: string;
}

export interface ThoughtData extends Record<string, unknown> {
  question: string;
  response: string;
  responses: string[];
  /** Question wording per version, parallel to `responses` — a version is a
      (question, answer) PAIR, so an edited question never orphans the
      answers written against the old wording. Absent = every version shares
      the current `question` (pre-migration canvases, never-edited nodes). */
  questions?: string[];
  responseIndex: number;
  isCollapsed: boolean;
  isEditing: boolean;
  isEditingResponse: boolean;
  isLoading: boolean;
  generationFailed?: boolean; // set on LLM failure; cleared on retry/success (persisted so Retry survives refresh)
  references?: Reference[]; // web sources cited by the current response ([n] markers)
  model?: string; // per-node LLM override; undefined = follow the global picker
  webSearch?: boolean; // may this node's generation use web search? (snapshotted at ask time; undefined = legacy, follow global)
  scholarSearch?: boolean; // same for arXiv / Semantic Scholar tools
  /** may this node's generation recall past conversations and memories (the why layer)? snapshotted at ask time like the search switches */
  recall?: boolean;
  /** the reach and the amount this ask's recall ran with (snapshotted like the switch; undefined = the defaults at the time) */
  recallReach?: 'light' | 'deep' | 'full';
  recallScale?: 'lean' | 'standard' | 'generous';
  /** what recall brought in for this node: listed, priced, removable; reused as they stand on a rerun */
  recallItems?: RecallItem[];
  recallMeta?: RecallMeta;
  /** while a wide recall is being judged: how many candidates the judge has seen */
  recallProgress?: { done: number; total: number } | null;
  autoRerun?: boolean; // regenerate in place whenever an upstream ancestor finishes (generic primitive)
  /** Transient: a regeneration is streaming and data.response still holds
      the OLD text (cleared on the first new chunk) — display shows the live
      thinking, not the stale answer. */
  restreaming?: boolean;
  /** The runtime session this node's last agent turn ran in (desktop agent lanes). */
  agentSession?: {
    runtime: AgentRuntime; sessionId: string | null; sessionFile: string | null; cwd: string;
    /** the effort level the turn actually ran at, in the runtime's own words, from its own record */
    effort?: string;
    /** the turn continued the mirrored session instead of opening a fresh one */
    continued?: boolean;
    /** what changed on disk during the turn, by the file system's account */
    changes?: { changed: string[]; added: string[]; removed: string[]; truncated?: boolean };
  };
  /** Transient: the tool calls of the agent turn running now, in order. */
  agentTrace?: AgentTraceEntry[];
  /** A note cited from the why layer: which agent's turn or memory entry
      it quotes. Provenance for the reader; the note's text is the quote. */
  recallSource?: { kind: 'turn' | 'memory'; runner: string; session: string; turn: number; title: string; file: string; at?: string; open: string; cwd: string };
  /** Transient: an agent runtime is waiting for the person's decision on one action. */
  /** Transient: approvals the agent is waiting on, oldest first. A model can
      ask for several at once (parallel tool calls); each is answered on its
      own card and the turn resumes only when all are answered. */
  pendingApprovals?: ApprovalRequest[];
  /** Every approval decided during this turn's generations, oldest first. */
  approvals?: ApprovalRecord[];
  archived?: boolean; // pruned-but-kept: dimmed on canvas, EXCLUDED from every context walk
  archivedAt?: string; // ISO timestamp: when it was pruned (thinking-timeline raw data)
  /** Provenance seed for staleness tracking: fingerprint of the exact
      context this node's current response was generated from, plus when.
      A future staleness pass compares this against the CURRENT upstream
      fingerprint to flag "upstream changed since this was written". */
  lastContextHash?: string;
  /** per upstream node, at generation time: a hash of what it contributed and its opening text — so a later change can be judged, not only detected */
  lastContextParts?: Record<string, { h: string; head: string }>;
  lastGeneratedAt?: string;
  // ── thinking-timeline raw data (write-only for now: a future timeline /
  //    process-replay view needs these recorded from day one — they cannot
  //    be reconstructed later) ──
  createdAt?: string; // when the node entered the canvas
  askedAt?: string; // when its question was (last) committed
  generatedAts?: (string | undefined)[]; // per-version answer completion times, parallel to responses[]
  editedAts?: (string | undefined)[]; // per-version manual-revision times (the human intervened) — generation stamps stay untouched
  // ── node kind (beyond the default Q&A node) ──
  // 'human' = a dialogue turn (the human asks here); 'prompt' = a machine
  // processing step (fixed prompt, context only from upstream);
  // 'note' / 'file' / 'link' = CONTENT nodes (canvas material: markdown
  // text, attachments, or a stamped web snapshot) — they never generate,
  // feed context only via OUTGOING edges, and are ignored by autoLayout.
  // Legacy v1 kinds ('step'|'fanout'|'review'|'synthesis') still
  // instantiate; 'fanout' also marks fan-out placeholders.
  // 'frame' = a labeled background region (spatial annotation) — no handles,
  // never in context, ignored by layout; the wayfinding primitive.
  stepKind?: 'human' | 'prompt' | 'note' | 'file' | 'link' | 'frame' | 'step' | 'fanout' | 'review' | 'synthesis';
  /** Provenance of a node imported from an external runner session (the
      continuity layer's read direction). Source sessions stay read-only;
      these ids let a future continuation point back at native items. */
  /** Provenance of an imported turn. `cwd` is the source session's working
      directory: relative paths the agent wrote ("./fig1.png") resolve
      against it. */
  importSource?: {
    runner: string; sessionId: string; itemIds: string[]; cwd?: string;
    /** a run the parent turn delegated (Pi's subagent tool, Claude Code's Agent, a Codex child
        thread): the agent's name in the runner's words, and the first item id of the turn that
        delegated — the node hangs off that turn as a branch */
    subagent?: { agent: string; of: string };
  };
  /** Frozen snapshot of the SOURCE projection at import time. The working
      question/response fields are free to iterate; this never changes, so
      "has this node diverged from its source?" is a field comparison, and
      the mirror outlives runner-side cleanup (sessions are short-lived
      upstream — the canvas is the archive). */
  source?: { question: string; response: string };
  linkUrl?: string; // link node: the source URL
  linkTitle?: string; // link node: page title (or a ⚠-prefixed fetch error)
  linkFetchedAt?: string; // link node: ISO timestamp of the snapshot (web content drifts)
  /** link node: the sanit-ready page HTML captured at fetch time. Serves the
      reader's original view only — context always reads the extracted copy
      in `question`. Absent on old snapshots and non-HTML fetches. */
  linkSnapshotHtml?: string;
  frameColor?: string; // frame node: fixed-palette color token (wayfinding, not decoration)
  frameCarry?: boolean; // frame node: dragging carries contained nodes (absent = true; new frames start false so they can be adjusted into place first)
  instruction?: string; // paradigm body: the prompt (prompt node) or operator guidance (human node)
  fanoutRoles?: { name: string; prompt: string }[]; // role list carried by fanout steps/placeholders
  autoRerunRounds?: number; // max auto-triggered runs per user action (default 1); >1 enables loops
  tokenCount: number;
  branchContext?: string;
  highlights: Highlight[];
  highlightMode: 'off' | 'tag' | 'filter'; // off=normal, tag=mark important, filter=pass highlights only
  summary?: string; // legacy single display summary (pre-versioned nodes)
  /** Display-only summaries, aligned with `responses` by index. Never enter
      context or fingerprints — the map layer, not the transcript. */
  summaries?: (string | undefined | null)[];
  /** Which model produced each response version (id, vendor prefix and all).
      Recorded at generation time so switching the global model later never
      obscures where an old answer came from. */
  generatedBy?: (string | undefined | null)[];
  /** Per version: this answer used the model gateway's built-in web search
      (no tool pings from the proxy, so the stream flags it once instead). */
  gatewaySearches?: (boolean | undefined)[];
  /** per version: the effort level an agent turn actually ran at (its own record); absent for API models */
  generatedEfforts?: (string | undefined | null)[];
  /** Epistemic move per version: insight (default, unmarked) | ruleout |
      decision | pivot | open. Auto-labeled by the takeaway judge; display
      layer only. */
  summaryTypes?: (string | undefined | null)[];
  /** the judge's probability for the type, parallel to summaryTypes; absent when a model's tag was taken as-is */
  summaryTypeConfidences?: (number | undefined | null)[];
  /** how settled the version's conclusion is (0 speculative … 3 verified), by the judge; parallel to summaries */
  summaryConclusiveness?: (number | undefined | null)[];
  /** Micro topic per version (≤6 CJK chars / ≤14 latin): the noun phrase the
      narrow surfaces show — timeline tooltips, unbadged plaques. Written by
      the same judge call as the summary; display layer only. Older canvases
      lack it — every consumer must fall back to the summary itself. */
  summaryTopics?: (string | undefined | null)[];
  /** The zoom ladder per version (see lib/ladder.ts): nested texts the map
      plaque morphs between as the zoom changes. Absent on older canvases and
      on short answers; the plaque then falls back to summary/topic. */
  summaryLadders?: (Ladder | undefined | null)[];
  /** Where on the source material this question was asked from: page number,
      plus selection rectangles as fractions of the page box when asked in the
      original PDF view (rects power the in-reader marks; page alone powers
      the canvas p.N chip — text-view selections have no page-box geometry). */
  anchor?: {
    page: number;
    rects?: [number, number, number, number][];
    /** The attachment this anchor points into. Lets edge-less clip nodes
        (notes/images extracted from a document) keep their provenance —
        the reader shows their marks and the p.N chip finds its way back
        without wiring the heavy material into their context. */
    attId?: string;
  };
  /** Marks a guided-digest node: the attachment id it digests. The reader's
      digest tab is a view of this node; rerun routes through the digest
      prompt (see generateDigest). */
  digestOf?: string;
  /** Distill node in a condensed copy-tree: the original-tree node ids this
      node collapsed. Powers the provenance chip (click = highlight the
      source run); context flows through normal wires only. */
  condensedFrom?: string[];
  /** Reasoning/thinking stream of the CURRENT generation (live buffer). */
  reasoning?: string;
  /** Per-version reasoning, aligned with `responses` by index. Display
      only: never enters context, fingerprints or summaries. Models that
      don't emit reasoning leave holes (undefined). */
  reasonings?: (string | undefined | null)[];
  /** Per-version thinking token count, aligned with `responses`, for a
      version whose thinking text was not kept: an imported or agent turn
      (the importer counts the thinking and drops it; Codex logs only the
      count). Display only, like `reasonings`. */
  reasoningTokens?: (number | undefined | null)[];
  rolePrompt?: string;
  appliedRole?: string; // the role actually used when generating the current response
  roleSourceNodeId?: string; // user-chosen role source node (for multi-parent role conflict)
  roleMode: 'inherit' | 'set-next' | 'reset'; // inherit from ancestors / set for descendants / reset for this node
  attachments: Attachment[];
  excludedAttachmentIds: string[]; // upstream attachment IDs to exclude from context
  includedAttachmentIds: string[]; // override ancestor exclusions (re-include)
  isRoot: boolean;
  isBranch: boolean;
  /** Evaluator nodes subscribe to a thread via watch edges and critique it. */
  isEvaluator?: boolean;
  /** auto = re-critique whenever the watched subtree produces new content. */
  evaluatorTrigger?: 'auto' | 'manual';
  /** Context Focus role, set ONLY by the render pipeline (displayNodes) —
      never persisted. target = the focused node, ctx = feeds its context,
      down = one structural step downstream (not in context). */
  focusRole?: 'target' | 'ctx' | 'down';
}

export type ThoughtNode = Node<ThoughtData, 'thought'>;

export interface ThoughtEdge extends Edge {
  data?: {
    isCrossLink?: boolean;
    isBranchFromSelection?: boolean;
    /** Position of this edge's upstream BLOCK in the target's context when
        the target has several parents (set via the focus panel; creation
        order when absent). Lives on the edge — semantics drive rendering. */
    contextOrder?: number;
    /** Watch edge: watched node → evaluator. Treated as a cross-link for
        layout (no tree structure) but feeds context like any incoming edge. */
    isWatch?: boolean;
    followsTip?: boolean; // edge slides forward to the newest node of its source thread
    branchYRatio?: number; // where along the parent the branch handle sits
    /** Cross-link depth: default (absent) = quote — the source node's own
        Q/A plus a one-line trail of its upstream questions. 'full' = the
        whole structural chain behind the source, still fenced as one
        reference block. Solid (structural) edges ignore this. */
    contextDepth?: 'full';
    /** ISO timestamp for edges wired INDEPENDENTLY of node birth (manual
        connect). Most edges are born with their target node — consumers
        should fall back to the target's createdAt. */
    createdAt?: string;
    /** Context Focus role, set ONLY by the render pipeline — never persisted.
        path = structural feed line, ref = reference into the context,
        down = one step downstream. */
    focusRole?: 'path' | 'ref' | 'down';
  };
}

export interface DAGState {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  history: { nodes: ThoughtNode[]; edges: ThoughtEdge[] }[];
  historyIndex: number;
}

/** Semantic operations recorded in the canvas event log (form 2 of the
    thinking timeline). View-level noise (drag, collapse, typing) is
    deliberately NOT here; ops record that something happened, never the
    content itself (the canvas carries the content). */
export type CanvasOp =
  | 'ask' | 'generate' | 'edit-question' | 'edit-response' | 'regenerate'
  | 'delete' | 'archive' | 'unarchive'
  | 'highlight-add' | 'highlight-remove'
  | 'connect' | 'disconnect'
  | 'merge' | 'weave' | 'explore' | 'fanout'
  | 'material-add' | 'undo' | 'redo'
  /** a request left for a model: the hash of what was sent, and which
      nodes it was built from — the alignment fact, recorded at send time */
  | 'commit';

export interface CanvasEvent {
  t: string; // ISO timestamp
  op: CanvasOp;
  /** Primary object (node or edge id). */
  id?: string;
  /** Light metadata only — counts, model names, flags. NEVER text content. */
  d?: Record<string, string | number | boolean>;
}
