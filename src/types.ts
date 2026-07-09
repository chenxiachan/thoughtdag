import type { Node, Edge } from '@xyflow/react';

export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number;
  content: string; // base64 for images/PDF, raw text for text files
  thumbnailUrl?: string; // data URL for image preview
  extractedText?: string; // companion text (PDF extraction / image auto-understanding)
  extractedBy?: string; // which model produced extractedText (provenance for the run manifest)
  pageImages?: string[]; // rendered page images as base64 PNG (PDF)
  numPages?: number; // PDF page count
  renderMode?: 'full' | 'text-only'; // PDF: include page images or text only
  isExtracting?: boolean; // PDF extraction in progress
}

export interface Highlight {
  id: string;
  text: string;
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
  // ── node kind (beyond the default Q&A node) ──
  // 'human' = a dialogue turn (the human asks here); 'prompt' = a machine
  // processing step (fixed prompt, context only from upstream);
  // 'note' / 'file' / 'link' = CONTENT nodes (canvas material: markdown
  // text, attachments, or a stamped web snapshot) — they never generate,
  // feed context only via OUTGOING edges, and are ignored by autoLayout.
  // Legacy v1 kinds ('step'|'fanout'|'review'|'synthesis') still
  // instantiate; 'fanout' also marks fan-out placeholders.
  stepKind?: 'human' | 'prompt' | 'note' | 'file' | 'link' | 'step' | 'fanout' | 'review' | 'synthesis';
  linkUrl?: string; // link node: the source URL
  linkTitle?: string; // link node: page title (or a ⚠-prefixed fetch error)
  linkFetchedAt?: string; // link node: ISO timestamp of the snapshot (web content drifts)
  instruction?: string; // paradigm body: the prompt (prompt node) or operator guidance (human node)
  fanoutRoles?: { name: string; prompt: string }[]; // role list carried by fanout steps/placeholders
  autoRerunRounds?: number; // max auto-triggered runs per user action (default 1); >1 enables loops
  tokenCount: number;
  branchContext?: string;
  highlights: Highlight[];
  highlightMode: 'off' | 'tag' | 'filter'; // off=normal, tag=mark important, filter=pass highlights only
  summary?: string;
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
  };
}

export interface DAGState {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  history: { nodes: ThoughtNode[]; edges: ThoughtEdge[] }[];
  historyIndex: number;
}
