import type { Node, Edge } from '@xyflow/react';

export interface Attachment {
  id: string;
  name: string;
  type: string; // MIME type
  size: number;
  content: string; // base64 for images/PDF, raw text for text files
  thumbnailUrl?: string; // data URL for image preview
  extractedText?: string; // extracted text (PDF)
  pageImages?: string[]; // rendered page images as base64 PNG (PDF)
  numPages?: number; // PDF page count
  renderMode?: 'full' | 'text-only'; // PDF: include page images or text only
  isExtracting?: boolean; // PDF extraction in progress
}

export interface Highlight {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
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
  tokenCount: number;
  branchContext?: string;
  highlights: Highlight[];
  highlightMode: 'off' | 'tag' | 'filter'; // off=normal, tag=mark important, filter=pass highlights only
  summary?: string;
  rolePrompt?: string;
  appliedRole?: string; // the role actually used when generating the current response
  roleSourceNodeId?: string; // user-chosen role source node (for multi-parent role conflict)
  inheritRole: boolean; // true=inherit from ancestors, false=stop inheritance
  roleMode: 'inherit' | 'set-next' | 'reset'; // explicit mode for UI
  attachments: Attachment[];
  excludedAttachmentIds: string[]; // upstream attachment IDs to exclude from context
  includedAttachmentIds: string[]; // override ancestor exclusions (re-include)
  isRoot: boolean;
  isBranch: boolean;
}

export type ThoughtNode = Node<ThoughtData, 'thought'>;

export interface ThoughtEdge extends Edge {
  data?: {
    isCrossLink?: boolean;
    isBranchFromSelection?: boolean;
  };
}

export interface DAGState {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  history: { nodes: ThoughtNode[]; edges: ThoughtEdge[] }[];
  historyIndex: number;
}
