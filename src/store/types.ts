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
  navigateVersion: (nodeId: string, direction: 'prev' | 'next') => void;
  deleteVersion: (nodeId: string, versionIndex: number) => void;
  batchDelete: (nodeIds: string[]) => void;
  /** Re-run the column-tree layout over the whole graph (undoable). */
  relayout: () => void;
  /** Stack the selected nodes into one vertical column, in conversation order (undoable). */
  alignSelection: (nodeIds: string[]) => void;
  /** Set/clear a per-node LLM override (undefined = follow the global picker). */
  setNodeModel: (nodeId: string, model: string | undefined) => void;
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
  regenerate: (nodeId: string) => void;
  distillRegenerate: (nodeId: string) => void;
  batchMergeSummarize: (nodeIds: string[], deleteAfter?: boolean) => void;
  stopGeneration: (nodeId: string) => void;
}

export interface RoleSlice {
  setRolePrompt: (nodeId: string, rolePrompt: string) => void;
  setRoleMode: (nodeId: string, mode: 'inherit' | 'set-next' | 'reset') => void;
  setRoleSource: (nodeId: string, sourceNodeId: string | undefined) => void;
  getAvailableRoles: (nodeId: string) => { nodeId: string; role: string; isPrimary: boolean; label: string }[];
}

export interface HighlightSlice {
  addHighlight: (nodeId: string, highlight: Highlight) => void;
  removeHighlight: (nodeId: string, highlightId: string) => void;
  setHighlightMode: (nodeId: string, mode: 'off' | 'tag' | 'filter') => void;
  setSummary: (nodeId: string, summary: string) => void;
}

export interface EvaluatorSlice {
  /** PRESET: ordinary node with a critic role + autoRerun, wired by a followsTip edge. */
  attachEvaluator: (watchedNodeId: string, rolePrompt: string, roleName: string) => Promise<void>;
  /** Regenerate a node in place from its incoming edges, appending a version (generic primitive). */
  rerunNode: (nodeId: string, opts?: { auto?: boolean }) => Promise<void>;
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
