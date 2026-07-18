import type { ThoughtNode, ThoughtEdge, Highlight, Attachment } from '../types';

export interface Snapshot {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
}

export interface HistorySlice {
  history: Snapshot[];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export interface NodeSlice {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  setNodes: (nodes: ThoughtNode[]) => void;
  setEdges: (edges: ThoughtEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdges: (edgeIds: string[]) => void;
  editResponse: (nodeId: string, response: string) => void;
  toggleCollapse: (nodeId: string) => void;
  setEditing: (nodeId: string, editing: boolean) => void;
  setEditingResponse: (nodeId: string, editing: boolean) => void;
  duplicateNode: (nodeId: string) => void;
  addCrossLink: (sourceId: string, targetId: string) => void;
  /** Flip a dashed reference between quote (default) and full-chain depth. */
  setCrossLinkDepth: (edgeId: string, depth: 'quote' | 'full') => void;
  navigateVersion: (nodeId: string, direction: 'prev' | 'next') => void;
  deleteVersion: (nodeId: string, versionIndex: number) => void;
  batchDelete: (nodeIds: string[]) => void;
  /** Duplicate the multi-selection as a detached copy: inner edges kept, boundary edges cut, attachments shared by reference under new ids (undoable). */
  duplicateSelection: (nodeIds: string[]) => void;
  /** Re-run the column-tree layout over the whole graph (undoable). */
  relayout: () => void;
  /** Stack the selected nodes into one vertical column, in conversation order (undoable). */
  alignSelection: (nodeIds: string[]) => void;
  /** Set/clear a per-node LLM override (undefined = follow the global picker). */
  setNodeModel: (nodeId: string, model: string | undefined) => void;
  /** Archive/unarchive nodes: dimmed on canvas, excluded from every context walk (undoable). */
  setArchived: (nodeIds: string[], archived: boolean) => void;
  /** Nodes whose answers predate upstream changes (derived, not persisted). */
  staleIds: string[];
  /** Recompute staleness across the graph (debounce-subscribed to nodes/edges). */
  recomputeStaleness: () => void;
}

export interface AddQuestionOptions {
  parentId?: string;
  /** Selected text this node explores; also marks the node as an orange branch. */
  branchContext?: string;
  branchYRatio?: number;
  /** false → the new node starts with roleMode 'reset' (no inherited role). */
  inheritRole?: boolean;
  rolePrompt?: string;
  initialAttachments?: Attachment[];
  excludeAllInheritedAttachments?: boolean;
}

export interface LlmSlice {
  addQuestion: (question: string, opts?: AddQuestionOptions) => void;
  editQuestion: (nodeId: string, question: string) => void;
  /** A paradigm human turn: record the question WITHOUT generating (the
   *  answers belong to downstream prompt nodes), then advance the cascade. */
  submitHumanTurn: (nodeId: string, question: string) => void;
  /** Multi-select explore: new node with a REAL edge from every selected node. */
  exploreFrom: (nodeIds: string[], question: string) => Promise<void>;
  /** Fan out N perspectives: once = blind candidate branches; follow = reviewers that auto-rerun with the thread. */
  fanOut: (parentId: string, question: string, roles: { name: string; prompt: string }[], opts?: { follow?: boolean; rounds?: number }) => Promise<void>;
  regenerate: (nodeId: string) => void;
  batchMergeSummarize: (nodeIds: string[], deleteAfter?: boolean, intent?: string) => void;
  /** Weave the highlights of the selected nodes into one cited passage.
   *  Input = the user's OWN marks (already-human-curated), so context stays
   *  small even for whole-canvas selections; the passage cites [n] back to
   *  its source highlights. Optional intent steers angle/purpose. */
  weaveHighlights: (nodeIds: string[], intent?: string) => Promise<void>;
  stopGeneration: (nodeId: string) => void;
}

export interface RoleSlice {
  setRolePrompt: (nodeId: string, rolePrompt: string) => void;
}

export interface HighlightSlice {
  addHighlight: (nodeId: string, highlight: Highlight) => void;
  removeHighlight: (nodeId: string, highlightId: string) => void;
  setHighlightMode: (nodeId: string, mode: 'off' | 'tag' | 'filter') => void;
  setSummary: (nodeId: string, summary: string, forResponse: string, type?: string) => void;
}

export interface EvaluatorSlice {
  /** PRESET: ordinary node with a critic role + autoRerun, wired by a followsTip edge. */
  /** Regenerate a node in place from its incoming edges, appending a version (generic primitive). */
  rerunNode: (nodeId: string, opts?: { auto?: boolean }) => Promise<void>;
  /** Replay every currently-stale node in dependency order (confirm first — N generations). */
  replayStale: () => Promise<void>;
  /** Toggle the autoRerun primitive on any node. */
  setAutoRerun: (nodeId: string, enabled: boolean) => void;
  /** Set how many auto rounds per user action this node may fire (loops need >1). */
  setAutoRerunRounds: (nodeId: string, rounds: number) => void;
}

export interface AttachmentSlice {
  addAttachment: (nodeId: string, attachment: Attachment) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => void;
  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => void;
  setAttachmentData: (nodeId: string, attachmentId: string, data: Partial<Attachment>) => void;
  getInheritedAttachments: (nodeId: string) => { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[];
}

export type StoreState = HistorySlice & NodeSlice & LlmSlice & RoleSlice & HighlightSlice & AttachmentSlice & EvaluatorSlice;

export type PersistedState = { nodes: ThoughtNode[]; edges: ThoughtEdge[] };
