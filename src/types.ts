import type { Node, Edge } from '@xyflow/react';

export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number;
  addedAt?: string; // ISO timestamp: when this material entered the canvas (thinking-timeline raw data)
  content: string; // base64 for images/PDF, raw text for text files
  thumbnailUrl?: string; // data URL for image preview
  extractedText?: string; // companion text (PDF extraction / image auto-understanding)
  extractedBy?: string; // which model produced extractedText (extraction provenance)
  pageImages?: string[]; // rendered page images as base64 PNG (PDF)
  numPages?: number; // PDF page count
  renderMode?: 'full' | 'text-only'; // PDF: include page images or text only
  isExtracting?: boolean; // PDF extraction in progress
  digest?: string; // reader's guided digest (markdown, with (p.N) anchors)
  digestBy?: string; // model that wrote the digest
}

export interface Highlight {
  id: string;
  text: string;
  at?: string; // ISO timestamp: when the user marked it (thinking-timeline raw data)
}

/** A web source the model consulted while generating a response. */
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
  autoRerun?: boolean; // regenerate in place whenever an upstream ancestor finishes (generic primitive)
  archived?: boolean; // pruned-but-kept: dimmed on canvas, EXCLUDED from every context walk
  archivedAt?: string; // ISO timestamp: when it was pruned (thinking-timeline raw data)
  /** Provenance seed for staleness tracking: fingerprint of the exact
      context this node's current response was generated from, plus when.
      A future staleness pass compares this against the CURRENT upstream
      fingerprint to flag "upstream changed since this was written". */
  lastContextHash?: string;
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
  linkUrl?: string; // link node: the source URL
  linkTitle?: string; // link node: page title (or a ⚠-prefixed fetch error)
  linkFetchedAt?: string; // link node: ISO timestamp of the snapshot (web content drifts)
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
  /** Epistemic move per version: insight (default, unmarked) | ruleout |
      decision | pivot | open. Auto-labeled by the takeaway judge; display
      layer only. */
  summaryTypes?: (string | undefined | null)[];
  /** Where on the source material this question was asked from: page number,
      plus selection rectangles as fractions of the page box when asked in the
      original PDF view (rects power the in-reader marks; page alone powers
      the canvas p.N chip — text-view selections have no page-box geometry). */
  anchor?: { page: number; rects?: [number, number, number, number][] };
  /** Marks a guided-digest node: the attachment id it digests. The reader's
      digest tab is a view of this node; rerun routes through the digest
      prompt (see generateDigest). */
  digestOf?: string;
  /** Reasoning/thinking stream of the CURRENT generation (live buffer). */
  reasoning?: string;
  /** Per-version reasoning, aligned with `responses` by index. Display
      only: never enters context, fingerprints or summaries. Models that
      don't emit reasoning leave holes (undefined). */
  reasonings?: (string | undefined | null)[];
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
}

export type ThoughtNode = Node<ThoughtData, 'thought'>;

export interface ThoughtEdge extends Edge {
  data?: {
    isCrossLink?: boolean;
    isBranchFromSelection?: boolean;
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
  | 'material-add' | 'undo' | 'redo';

export interface CanvasEvent {
  t: string; // ISO timestamp
  op: CanvasOp;
  /** Primary object (node or edge id). */
  id?: string;
  /** Light metadata only — counts, model names, flags. NEVER text content. */
  d?: Record<string, string | number | boolean>;
}
