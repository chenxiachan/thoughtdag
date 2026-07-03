import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './lib/persistence';
import type { ThoughtNode, ThoughtEdge, Highlight, Attachment } from './types';
import { generateId, countTokens, autoLayout, getDescendantIds } from './utils';
import { llmCall, llmCallStream, type ContextMessage, type ImageAttachment } from './lib/api';

// Background summary generation — fire and forget
function generateSummary(nodeId: string, question: string, response: string, setSummary: (id: string, summary: string) => void) {
  llmCall([
    { role: 'user', content: question },
    { role: 'assistant', content: response },
    { role: 'user', content: 'Summarize the above Q&A in 1-2 sentences, around 80-110 characters. Use the same language as the question. Output only the summary text, no ellipsis, no quotes, no prefix.' },
  ]).then((summary) => {
    setSummary(nodeId, summary);
  }).catch(() => {});
}

// Build conversation history by walking up the ancestor DAG
// All edges (blue, orange, cross-link) contribute to context as long as
// they point toward the current node. This is a pure DAG traversal.
interface BuildContextResult {
  messages: ContextMessage[];
  images: ImageAttachment[];
}

function buildContext(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
  branchContext?: string,
  excludedAttachmentIds?: string[],
  includedAttachmentIds?: string[],
): BuildContextResult {
  const messages: ContextMessage[] = [];
  const images: ImageAttachment[] = [];
  // Collect excludedAttachmentIds from ALL nodes in the path (propagation)
  const excludeSet = new Set<string>(excludedAttachmentIds || []);
  const seenAttachmentFingerprints = new Set<string>();
  
  // Topological-order collection of all ancestors via incoming edges
  const ordered: ThoughtNode[] = [];
  const visited = new Set<string>();

  function walkUp(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    
    // Follow ALL incoming edges (blue, orange, cross-link — any arrow pointing here)
    const incomingEdges = edges.filter((e) => e.target === id);
    for (const edge of incomingEdges) {
      walkUp(edge.source);
    }
    
    ordered.push(node);
  }
  
  walkUp(nodeId);

  // Propagate excludedAttachmentIds from all ancestors
  const includeOverrides = new Set<string>(includedAttachmentIds || []);
  for (const node of ordered) {
    for (const exId of (node.data.excludedAttachmentIds || [])) {
      if (!includeOverrides.has(exId)) {
        excludeSet.add(exId);
      }
    }
  }

  // Convert ordered ancestors to messages, respecting highlightMode and collapse/summary
  for (const node of ordered) {
    // Collect attachments from this node (respecting excludedAttachmentIds + cross-node dedup)
    const nodeAttachments = node.data.attachments || [];
    for (const att of nodeAttachments) {
      if (excludeSet.has(att.id)) continue;
      const fp = `${att.name}|${att.size}|${att.content?.substring(0, 100)}`;
      if (seenAttachmentFingerprints.has(fp)) continue;
      seenAttachmentFingerprints.add(fp);
      if (att.type.startsWith('image/')) {
        images.push({ data: att.content, mimeType: att.type });
      } else if (att.type === 'application/pdf') {
        // PDF: inject extracted text + optionally page images for Vision
        if (att.extractedText) {
          messages.push({ role: 'user', content: `[PDF: ${att.name}]\n${att.extractedText}` });
        }
        if (att.renderMode !== 'text-only' && att.pageImages && att.pageImages.length > 0) {
          for (const pageImg of att.pageImages) {
            images.push({ data: pageImg, mimeType: 'image/png' });
          }
        }
        if (!att.extractedText && !att.pageImages) {
          messages.push({ role: 'user', content: `[PDF: ${att.name} — extracting content...]` });
        }
      } else {
        // Text files: inject as user message context
        messages.push({ role: 'user', content: `[File: ${att.name}]\n${att.content}` });
      }
    }

    // Collapsed nodes with summary: pass summary only (context compression)
    if (node.data.isCollapsed && node.data.summary) {
      messages.push({ role: 'user', content: node.data.question });
      messages.push({ role: 'assistant', content: `[Summary] ${node.data.summary}` });
      continue;
    }
    if (node.data.question) {
      messages.push({ role: 'user', content: node.data.question });
    }
    if (node.data.response) {
      const mode = node.data.highlightMode || 'off';
      const highlights = node.data.highlights || [];
      if (mode === 'filter' && highlights.length > 0) {
        const filtered = highlights.map((h) => h.text).join('\n\n');
        messages.push({ role: 'assistant', content: filtered });
      } else if (mode === 'tag' && highlights.length > 0) {
        let tagged = node.data.response;
        for (const h of highlights) {
          tagged = tagged.replace(h.text, `[Important] ${h.text} [/Important]`);
        }
        messages.push({ role: 'assistant', content: tagged });
      } else {
        messages.push({ role: 'assistant', content: node.data.response });
      }
    }
  }
  
  // If this is a branch from selection, add the selected text
  if (branchContext) {
    messages.push({ role: 'user', content: `[Regarding this passage: "${branchContext}"]` });
  }

  // Check if user explicitly chose a role source (multi-parent conflict resolution)
  const selfNode = ordered[ordered.length - 1];
  if (selfNode?.data.roleSourceNodeId) {
    if (selfNode.data.roleSourceNodeId === '__none__') {
      return { messages, images };
    }
    const sourceNode = nodes.find((n) => n.id === selfNode.data.roleSourceNodeId);
    if (sourceNode?.data.rolePrompt) {
      messages.unshift({ role: 'system', content: sourceNode.data.rolePrompt });
      return { messages, images };
    }
  }

  // Resolve inherited rolePrompt using explicit roleMode:
  //   inherit: no own role, look up ancestors
  //   set-next: role for descendants only (skip for self)
  //   reset: role for self only (blocks inheritance for descendants)
  let resolvedRole: string | undefined;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const n = ordered[i];
    const isSelf = i === ordered.length - 1;
    const mode = n.data.roleMode || 'inherit';

    if (mode === 'reset') {
      // "Reset for this node" — only self gets the role; descendants get nothing
      resolvedRole = isSelf ? (n.data.rolePrompt || undefined) : undefined;
      break;
    }
    if (mode === 'set-next' && n.data.rolePrompt) {
      if (isSelf) {
        // "Set for next" on self — skip, role is for descendants only
        continue;
      }
      // Ancestor's "Set for next" — we are a descendant, use it
      resolvedRole = n.data.rolePrompt;
      break;
    }
    // mode === 'inherit' — use own rolePrompt if present, otherwise keep walking
    if (mode === 'inherit' && n.data.rolePrompt) {
      resolvedRole = n.data.rolePrompt;
      break;
    }
  }
  if (resolvedRole) {
    messages.unshift({ role: 'system', content: resolvedRole });
  }

  return { messages, images };
}

// Resolve available roles from all incoming edges (for multi-parent role conflict UI)
// Returns array of { nodeId, role, isPrimary } — one per distinct incoming path that has a role
function resolveAvailableRoles(
  nodeId: string,
  nodes: ThoughtNode[],
  edges: ThoughtEdge[],
): { nodeId: string; role: string; isPrimary: boolean; label: string }[] {
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  if (incomingEdges.length === 0) return [];

  const results: { nodeId: string; role: string; isPrimary: boolean; label: string }[] = [];
  const seenRoles = new Set<string>();

  for (const edge of incomingEdges) {
    const isCrossLink = !!edge.data?.isCrossLink;
    // Walk up from this edge's source to find the nearest role
    const visited = new Set<string>();
    function findRoleUp(id: string): { nodeId: string; role: string } | null {
      if (visited.has(id)) return null;
      visited.add(id);
      const n = nodes.find((nd) => nd.id === id);
      if (!n) return null;
      const mode = n.data.roleMode || 'inherit';
      if (mode === 'reset') {
        // Reset blocks: this node's role doesn't pass to children
        return null;
      }
      if (n.data.rolePrompt) {
        return { nodeId: n.id, role: n.data.rolePrompt };
      }
      // Keep walking up
      const parentEdges = edges.filter((e) => e.target === id);
      for (const pe of parentEdges) {
        const found = findRoleUp(pe.source);
        if (found) return found;
      }
      return null;
    }
    const found = findRoleUp(edge.source);
    if (found && !seenRoles.has(found.role)) {
      seenRoles.add(found.role);
      const sourceNode = nodes.find((n) => n.id === edge.source);
      results.push({
        nodeId: found.nodeId,
        role: found.role,
        isPrimary: !isCrossLink,
        label: sourceNode?.data.question?.slice(0, 30) || found.nodeId.slice(-6),
      });
    }
  }
  return results;
}

interface Snapshot {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
}

interface StoreState {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
  history: Snapshot[];
  historyIndex: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  setNodes: (nodes: ThoughtNode[]) => void;
  setEdges: (edges: ThoughtEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  addQuestion: (question: string, parentId?: string, branchContext?: string, branchYRatio?: number, inheritRole?: boolean, rolePrompt?: string, initialAttachments?: Attachment[], excludeAllInheritedAttachments?: boolean) => void;
  deleteNode: (nodeId: string) => void;
  editQuestion: (nodeId: string, question: string) => void;
  editResponse: (nodeId: string, response: string) => void;
  toggleCollapse: (nodeId: string) => void;
  setEditing: (nodeId: string, editing: boolean) => void;
  setEditingResponse: (nodeId: string, editing: boolean) => void;
  regenerate: (nodeId: string) => void;
  addHighlight: (nodeId: string, highlight: Highlight) => void;
  removeHighlight: (nodeId: string, highlightId: string) => void;
  setHighlightMode: (nodeId: string, mode: 'off' | 'tag' | 'filter') => void;
  distillRegenerate: (nodeId: string) => void;
  setSummary: (nodeId: string, summary: string) => void;
  setRolePrompt: (nodeId: string, rolePrompt: string) => void;
  setInheritRole: (nodeId: string, inherit: boolean) => void;
  setRoleMode: (nodeId: string, mode: 'inherit' | 'set-next' | 'reset') => void;
  setRoleSource: (nodeId: string, sourceNodeId: string | undefined) => void;
  getAvailableRoles: (nodeId: string) => { nodeId: string; role: string; isPrimary: boolean; label: string }[];
  duplicateNode: (nodeId: string) => void;
  addCrossLink: (sourceId: string, targetId: string) => void;
  navigateVersion: (nodeId: string, direction: 'prev' | 'next') => void;
  deleteVersion: (nodeId: string, versionIndex: number) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  batchDelete: (nodeIds: string[]) => void;
  batchMergeSummarize: (nodeIds: string[], deleteAfter?: boolean) => void;
  stopGeneration: (nodeId: string) => void;
  addAttachment: (nodeId: string, attachment: Attachment) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => void;
  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => void;
  setAttachmentData: (nodeId: string, attachmentId: string, data: Partial<Attachment>) => void;
  getInheritedAttachments: (nodeId: string) => { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[];
}

// Track active AbortControllers per node
const activeAbortControllers = new Map<string, AbortController>();

// Reset transient UI flags — applied both when persisting and when rehydrating,
// so a refresh mid-stream/mid-edit never restores a node stuck in loading state.
function stripTransient(nodes: ThoughtNode[]): ThoughtNode[] {
  return nodes.map((n) => ({
    ...n,
    selected: false,
    data: {
      ...n.data,
      isLoading: false,
      isEditing: false,
      isEditingResponse: false,
      attachments: (n.data.attachments || []).map((a) =>
        a.isExtracting ? { ...a, isExtracting: false } : a
      ),
    },
  }));
}

type PersistedState = { nodes: ThoughtNode[]; edges: ThoughtEdge[] };

export const useStore = create<StoreState>()(persist((set, get) => ({
  nodes: [],
  edges: [],
  history: [{ nodes: [], edges: [] }],
  historyIndex: 0,
  selectedNodeId: null,
  selectedNodeIds: [],

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({ nodes: JSON.parse(JSON.stringify(prev.nodes)), edges: JSON.parse(JSON.stringify(prev.edges)), historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({ nodes: JSON.parse(JSON.stringify(next.nodes)), edges: JSON.parse(JSON.stringify(next.edges)), historyIndex: historyIndex + 1 });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids, selectedNodeId: ids.length === 1 ? ids[0] : null }),

  addQuestion: async (question: string, parentId?: string, branchContext?: string, branchYRatio?: number, inheritRole?: boolean, rolePrompt?: string, initialAttachments?: Attachment[], excludeAllInheritedAttachments?: boolean) => {
    const id = generateId();
    const isRoot = !parentId;
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        question,
        response: '',
        responses: [],
        responseIndex: -1,
        isCollapsed: false,
        isEditing: false,
        isEditingResponse: false,
        isLoading: true,
        tokenCount: 0,
        branchContext,
        highlights: [], highlightMode: 'tag', attachments: initialAttachments || [],
        excludedAttachmentIds: excludeAllInheritedAttachments && parentId
          ? get().getInheritedAttachments(parentId).map(({ attachment }) => attachment.id).concat(
              (get().nodes.find((n) => n.id === parentId)?.data.attachments || []).map((a) => a.id)
            )
          : [],
        includedAttachmentIds: [],
        inheritRole: inheritRole !== false,
        roleMode: inheritRole === false ? 'reset' : 'inherit',
        rolePrompt: rolePrompt || undefined,
        isRoot,
        isBranch: !!branchContext,
      },
    };

    const isBranch = !!branchContext;
    const newEdge = parentId ? {
      id: `edge-${parentId}-${id}`,
      source: parentId,
      target: id,
      sourceHandle: isBranch ? 'branch' : 'continue',
      targetHandle: isBranch ? 'left' : 'top',
      type: 'smoothstep',
      ...(isBranch ? {
        style: { stroke: '#E08A3C', strokeWidth: 2, strokeDasharray: '6 3' },
        animated: true,
        markerEnd: { type: 'arrowclosed' as const, color: '#E08A3C', width: 16, height: 16 },
        data: { isBranchFromSelection: true, branchYRatio: branchYRatio ?? 0.5 },
      } : {
        style: { stroke: '#6B5CE7', strokeWidth: 2 },
        animated: false,
        markerEnd: { type: 'arrowclosed' as const, color: '#6B5CE7', width: 16, height: 16 },
        data: {},
      }),
    } : null;

    const newEdges = newEdge ? [...get().edges, newEdge] : get().edges;
    // Auto-collapse parent node when creating a child
    const updatedNodes = parentId
      ? get().nodes.map((n) => n.id === parentId ? { ...n, data: { ...n.data, isCollapsed: true } } : n)
      : get().nodes;
    const newNodes = autoLayout([...updatedNodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });

    try {
      const abortController = new AbortController();
      activeAbortControllers.set(id, abortController);
      // Build full context from blue-edge ancestors + current question
      const selfNode2 = get().nodes.find((n) => n.id === id);
      const ctx = parentId
        ? buildContext(parentId, get().nodes, get().edges, branchContext, selfNode2?.data.excludedAttachmentIds, selfNode2?.data.includedAttachmentIds)
        : { messages: [], images: [] };
      const contextMessages = ctx.messages;
      const contextImages = ctx.images;
      // Role injection for new nodes:
      // 1. Parent has set-next → inject parent's role (buildContext skips it because it treats parent as "self")
      // 2. New node is reset → inject its own role
      // 3. New node is root with set-next → inject its own role (no parent to inherit from)
      const newNodeData = get().nodes.find((n) => n.id === id)?.data;
      const parentNode = parentId ? get().nodes.find((n) => n.id === parentId) : null;
      
      let roleToInject: string | undefined;
      if (newNodeData?.roleMode === 'reset' && newNodeData.rolePrompt) {
        // Reset: this node's own role
        roleToInject = newNodeData.rolePrompt;
      } else if (newNodeData?.rolePrompt && newNodeData.roleMode === 'inherit' && !parentId) {
        // Root node with inherit + own rolePrompt (e.g. from landing page)
        roleToInject = newNodeData.rolePrompt;
      } else if (parentNode?.data.roleMode === 'set-next' && parentNode.data.rolePrompt) {
        // Parent has set-for-next: inject parent's role
        roleToInject = parentNode.data.rolePrompt;
      } else if (parentNode?.data.roleMode === 'inherit' && parentNode.data.rolePrompt) {
        // Parent has inherit + own rolePrompt: also passes to children
        // (buildContext already handles ancestors, but parent is treated as "self" and skipped for set-next;
        //  for inherit mode, buildContext DOES find parent's rolePrompt, so this is a backup)
        // Actually buildContext(parentId) treats parent as last in ordered, and inherit+rolePrompt → uses it.
        // So this case is already handled by buildContext. Skip.
      }
      
      if (roleToInject) {
        const filtered = contextMessages.filter((m) => m.role !== 'system');
        filtered.unshift({ role: 'system', content: roleToInject });
        contextMessages.length = 0;
        contextMessages.push(...filtered);
      }
      // Collect this node's own attachments (skip if same file already from ancestors)
      const selfAttachments = selfNode2?.data.attachments || [];
      for (const att of selfAttachments) {
        const alreadyInContext = contextMessages.some(m => m.content.includes(`[PDF: ${att.name}]`) || m.content.includes(`[File: ${att.name}]`));
        if (alreadyInContext) continue;
        if (att.type.startsWith('image/')) {
          contextImages.push({ data: att.content, mimeType: att.type });
        } else if (att.type === 'application/pdf') {
          if (att.extractedText) {
            contextMessages.push({ role: 'user', content: `[PDF: ${att.name}]\n${att.extractedText}` });
          }
          if (att.renderMode !== 'text-only' && att.pageImages && att.pageImages.length > 0) {
            for (const pageImg of att.pageImages) {
              contextImages.push({ data: pageImg, mimeType: 'image/png' });
            }
          }
        } else if (att.content) {
          contextMessages.push({ role: 'user', content: `[File: ${att.name}]\n${att.content}` });
        }
      }

      // Save the applied role before streaming
      const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
      contextMessages.push({ role: 'user', content: question });
      
      // Store appliedRole on the node
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, appliedRole } } : n
        ),
      }));

      const response = await llmCallStream(contextMessages, (_chunk, fullSoFar) => {
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, response: fullSoFar } } : n
          ),
        }));
      }, abortController.signal, contextImages);
      activeAbortControllers.delete(id);
      const tokenCount = countTokens(question + response);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, response, responses: [response], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } }
            : n
        ),
      }));
      get().pushHistory();
      generateSummary(id, question, response, get().setSummary);
    } catch (err) {
      activeAbortControllers.delete(id);
      // If aborted, keep whatever was generated so far
      const currentNode = get().nodes.find((n) => n.id === id);
      const partialResponse = currentNode?.data.response || '';
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const finalResponse = isAbort && partialResponse ? partialResponse : (partialResponse || 'Error generating response.');
      const tokenCount = countTokens(question + finalResponse);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, response: finalResponse, responses: [finalResponse], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } } : n
        ),
      }));
      if (isAbort) get().pushHistory();
    }
  },

  deleteNode: (nodeId: string) => {
    get().pushHistory();
    const { edges } = get();
    const descendants = getDescendantIds(nodeId, edges);
    const removeIds = new Set([nodeId, ...descendants]);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeIds.has(n.id)),
      edges: state.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
    }));
    get().pushHistory();
  },

  editQuestion: async (nodeId: string, question: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, question, isEditing: false, isLoading: true } } : n
      ),
    }));
    const abortController = new AbortController();
    activeAbortControllers.set(nodeId, abortController);
    try {
      const editNode = get().nodes.find((n) => n.id === nodeId);
      const editCtx = buildContext(nodeId, get().nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, question: '', response: '' } } : n
      ), get().edges, undefined, editNode?.data.excludedAttachmentIds, editNode?.data.includedAttachmentIds);
      const contextMessages = editCtx.messages;
      const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
      contextMessages.push({ role: 'user', content: question });
      set((state) => ({ nodes: state.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, appliedRole } } : n) }));
      
      const response = await llmCallStream(contextMessages, (_chunk, fullSoFar) => { set((state) => ({ nodes: state.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, response: fullSoFar } } : n) })); }, abortController.signal, editCtx.images);
      activeAbortControllers.delete(nodeId);
      const tokenCount = countTokens(question + response);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, response, responses: [response], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } }
            : n
        ),
      }));
      get().pushHistory();
      generateSummary(nodeId, question, response, get().setSummary);
    } catch {
      activeAbortControllers.delete(nodeId);
      const partial = get().nodes.find((n) => n.id === nodeId)?.data.response || '';
      const tokenCount = countTokens(question + partial);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, response: partial || 'Stopped.', responses: [partial || 'Stopped.'], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } } : n
        ),
      }));
      get().pushHistory();
    }
  },

  editResponse: (nodeId: string, response: string) => {
    get().pushHistory();
    const tokenCount = countTokens(get().nodes.find((n) => n.id === nodeId)?.data.question + response || response);
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                response,
                responses: n.data.responses.map((r, i) => (i === n.data.responseIndex ? response : r)),
                isEditingResponse: false,
                tokenCount,
                highlights: n.data.highlights.filter((h) => response.includes(h.text)),
              },
            }
          : n
      ),
    }));
    get().pushHistory();
  },

  toggleCollapse: (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Estimate height before and after toggle
    const oldCollapsed = node.data.isCollapsed;
    const responseLen = (node.data.response || '').length;
    const expandedHeight = Math.max(220, Math.min(600, 150 + (responseLen / 3)));
    const collapsedHeight = 80;
    const oldHeight = oldCollapsed ? collapsedHeight : expandedHeight;
    const newHeight = oldCollapsed ? expandedHeight : collapsedHeight;
    const delta = newHeight - oldHeight;

    // Find all descendants of this node
    const descendants = getDescendantIds(nodeId, get().edges);
    const descSet = new Set(descendants);

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, isCollapsed: !n.data.isCollapsed } };
        }
        // Shift descendants vertically by delta
        if (descSet.has(n.id)) {
          return { ...n, position: { ...n.position, y: n.position.y + delta } };
        }
        return n;
      }),
    }));
  },

  setEditing: (nodeId: string, editing: boolean) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditing: editing } } : n
      ),
    }));
  },

  setEditingResponse: (nodeId: string, editing: boolean) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditingResponse: editing } } : n
      ),
    }));
  },

  regenerate: async (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    
    // Find a structural parent (any incoming edge) for creating sibling
    const parentEdge = get().edges.find((e) => e.target === nodeId);
    const parentId = parentEdge?.source;
    
    // Create a new sibling node with the same question
    const id = generateId();
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        question: node.data.question,
        response: '',
        responses: [],
        responseIndex: -1,
        isCollapsed: false,
        isEditing: false,
        isEditingResponse: false,
        isLoading: true,
        tokenCount: 0,
        branchContext: node.data.branchContext,
        highlights: [], highlightMode: 'tag', attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        inheritRole: node.data.inheritRole,
        roleMode: node.data.roleMode || 'inherit',
        rolePrompt: node.data.rolePrompt,
        isRoot: !parentId,
        isBranch: node.data.isBranch,
      },
    };

    const newEdges = parentId
      ? [...get().edges, { id: `edge-${parentId}-${id}`, source: parentId, target: id, type: 'smoothstep' }]
      : get().edges;

    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });

    const abortController = new AbortController();
    activeAbortControllers.set(id, abortController);
    try {
      const regenSelf = get().nodes.find((n) => n.id === id);
      const regenCtx = parentId
        ? buildContext(parentId, get().nodes, get().edges, node.data.branchContext, regenSelf?.data.excludedAttachmentIds, regenSelf?.data.includedAttachmentIds)
        : { messages: [], images: [] };
      const contextMessages = regenCtx.messages;
      // Role injection for regenerated nodes (same logic as addQuestion)
      const regenData = regenSelf?.data;
      const regenParent = parentId ? get().nodes.find((n) => n.id === parentId) : null;
      let regenRole: string | undefined;
      if (regenData?.roleMode === 'reset' && regenData.rolePrompt) {
        regenRole = regenData.rolePrompt;
      } else if (regenData?.rolePrompt && regenData.roleMode === 'inherit' && !parentId) {
        regenRole = regenData.rolePrompt;
      } else if (regenParent?.data.roleMode === 'set-next' && regenParent.data.rolePrompt) {
        regenRole = regenParent.data.rolePrompt;
      }
      if (regenRole) {
        const filtered = contextMessages.filter((m) => m.role !== 'system');
        filtered.unshift({ role: 'system', content: regenRole });
        contextMessages.length = 0;
        contextMessages.push(...filtered);
      }
      const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
      contextMessages.push({ role: 'user', content: node.data.question });
      set((state) => ({ nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, appliedRole } } : n) }));
      const response = await llmCallStream(contextMessages, (_chunk, fullSoFar) => { set((state) => ({ nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, response: fullSoFar } } : n) })); }, abortController.signal, regenCtx.images);
      activeAbortControllers.delete(id);
      const tokenCount = countTokens(node.data.question + response);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, response, responses: [response], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } }
            : n
        ),
      }));
      get().pushHistory();
      generateSummary(id, node.data.question, response, get().setSummary);
    } catch {
      activeAbortControllers.delete(id);
      const partial = get().nodes.find((n) => n.id === id)?.data.response || '';
      const tokenCount = countTokens(node.data.question + partial);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, response: partial || 'Stopped.', responses: [partial || 'Stopped.'], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } } : n
        ),
      }));
      get().pushHistory();
    }
  },

  addHighlight: (nodeId: string, highlight: Highlight) => {
    get().pushHistory();
    // Normalize: collapse whitespace/newlines to single space
    const normalizedHighlight = { ...highlight, text: highlight.text.replace(/\s+/g, ' ').trim() };
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, highlights: [...n.data.highlights, normalizedHighlight] } }
          : n
      ),
    }));
    get().pushHistory();
  },

  removeHighlight: (nodeId: string, highlightId: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, highlights: n.data.highlights.filter((h) => h.id !== highlightId) } }
          : n
      ),
    }));
    get().pushHistory();
  },

  setHighlightMode: (nodeId: string, mode: 'off' | 'tag' | 'filter') => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, highlightMode: mode } } : n
      ),
    }));
  },

  distillRegenerate: async (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.data.highlights.length === 0) return;

    const highlightTexts = node.data.highlights.map((h) => h.text).join('\n\n');
    const id = generateId();
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        question: node.data.question,
        response: '',
        responses: [],
        responseIndex: -1,
        isCollapsed: false,
        isEditing: false,
        isEditingResponse: false,
        isLoading: true,
        tokenCount: 0,
        highlights: [], highlightMode: 'tag', attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        inheritRole: true,
        roleMode: 'inherit' as const,
        isRoot: false,
        isBranch: false,
      },
    };

    // Find parent of original node
    const parentEdge = get().edges.find((e) => e.target === nodeId);
    const newEdge = parentEdge ? {
      id: `edge-${parentEdge.source}-${id}`,
      source: parentEdge.source,
      target: id,
      sourceHandle: 'continue',
      targetHandle: 'top',
      type: 'smoothstep',
      style: { stroke: '#6B5CE7', strokeWidth: 2 },
      animated: false,
      markerEnd: { type: 'arrowclosed' as const, color: '#6B5CE7', width: 16, height: 16 },
      data: {},
    } : null;

    const newEdges = newEdge ? [...get().edges, newEdge] : get().edges;
    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });

    try {
      const distillCtx = parentEdge
        ? buildContext(parentEdge.source, get().nodes, get().edges)
        : { messages: [], images: [] };
      const contextMessages = distillCtx.messages;
      contextMessages.push({ role: 'user', content: node.data.question });
      contextMessages.push({
        role: 'user',
        content: `Based on the following highlighted key content, regenerate a more concise response. Keep these key points, remove redundancy:\n\n${highlightTexts}`,
      });

      const response = await llmCallStream(contextMessages, (_chunk, fullSoFar) => { set((state) => ({ nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, response: fullSoFar } } : n) })); });
      const tokenCount = countTokens(node.data.question + response);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, response, responses: [response], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount } }
            : n
        ),
      }));
      get().pushHistory();
      generateSummary(id, node.data.question, response, get().setSummary);
    } catch {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, response: 'Error generating response.', isLoading: false, isCollapsed: true } } : n
        ),
      }));
    }
  },

  setSummary: (nodeId: string, summary: string) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, summary } } : n
      ),
    }));
  },

  setRolePrompt: (nodeId: string, rolePrompt: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, rolePrompt: rolePrompt || undefined } } : n
      ),
    }));
    get().pushHistory();
  },

  setInheritRole: (nodeId: string, inherit: boolean) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, inheritRole: inherit } } : n
      ),
    }));
    get().pushHistory();
  },

  setRoleSource: (nodeId: string, sourceNodeId: string | undefined) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, roleSourceNodeId: sourceNodeId } } : n
      ),
    }));
    get().pushHistory();
  },

  getAvailableRoles: (nodeId: string) => {
    return resolveAvailableRoles(nodeId, get().nodes, get().edges);
  },

  setRoleMode: (nodeId: string, mode: 'inherit' | 'set-next' | 'reset') => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const inheritRole = mode !== 'reset';
        return { ...n, data: { ...n.data, roleMode: mode, inheritRole } };
      }),
    }));
    get().pushHistory();
  },

  duplicateNode: (nodeId: string) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    get().pushHistory();
    const id = generateId();
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: 0, y: 0 },
      dragHandle: '.drag-handle',
      data: {
        ...node.data,
        isCollapsed: true,
        isEditing: false,
        isEditingResponse: false,
        isLoading: false,
        highlights: node.data.highlights.map((h) => ({ ...h, id: generateId() })),
      },
    };
    // Find parent edge and create same type of edge
    const parentEdge = get().edges.find((e) => e.target === nodeId);
    const newEdge = parentEdge ? {
      ...parentEdge,
      id: `edge-${parentEdge.source}-${id}`,
      target: id,
    } : null;
    const newEdges = newEdge ? [...get().edges, newEdge] : get().edges;
    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });
    get().pushHistory();
  },

  addCrossLink: (sourceId: string, targetId: string) => {
    const { edges } = get();
    // Don't add if already exists or if it's a structural parent-child
    const exists = edges.some(
      (e) => (e.source === sourceId && e.target === targetId) || (e.source === targetId && e.target === sourceId)
    );
    if (exists) return;
    get().pushHistory();
    const newEdge: ThoughtEdge = {
      id: `crosslink-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      style: { stroke: '#6B5CE7', strokeDasharray: '8 4', strokeWidth: 2 },
      animated: true,
      data: { isCrossLink: true },
    };
    set((state) => ({ edges: [...state.edges, newEdge] }));
    get().pushHistory();
  },

  navigateVersion: (nodeId: string, direction: 'prev' | 'next') => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const { responses, responseIndex } = n.data;
        let newIndex = direction === 'prev' ? responseIndex - 1 : responseIndex + 1;
        if (newIndex < 0) newIndex = responses.length - 1;
        if (newIndex >= responses.length) newIndex = 0;
        return {
          ...n,
          data: { ...n.data, responseIndex: newIndex, response: responses[newIndex] },
        };
      }),
    }));
  },

  deleteVersion: (nodeId: string, versionIndex: number) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const newResponses = n.data.responses.filter((_, i) => i !== versionIndex);
        if (newResponses.length === 0) return n; // Don't delete last version
        const newIndex = Math.min(n.data.responseIndex, newResponses.length - 1);
        return {
          ...n,
          data: {
            ...n.data,
            responses: newResponses,
            responseIndex: newIndex,
            response: newResponses[newIndex],
          },
        };
      }),
    }));
    get().pushHistory();
  },

  batchDelete: (nodeIds: string[]) => {
    get().pushHistory();
    const removeSet = new Set(nodeIds);
    set((state) => ({
      nodes: state.nodes.filter((n) => !removeSet.has(n.id)),
      edges: state.edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target)),
      selectedNodeId: null,
      selectedNodeIds: [],
    }));
    get().pushHistory();
  },

  batchMergeSummarize: async (nodeIds: string[], deleteAfter?: boolean) => {
    // Collect content from selected nodes in order
    const { nodes, edges } = get();
    const selected = nodeIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean) as ThoughtNode[];
    if (selected.length === 0) return;

    // Build merged content
    const mergedContent = selected
      .map((n) => `Q: ${n.data.question}\nA: ${n.data.response}`)
      .join('\n\n---\n\n');

    // Find a common parent: use the parent of the first selected node
    const firstId = selected[0].id;
    const parentEdge = edges.find((e) => e.target === firstId && !e.data?.isCrossLink);
    const parentId = parentEdge?.source;

    // Create summary node
    const id = generateId();
    const summaryQuestion = `Merge summary of ${selected.length} nodes`;
    const newNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: selected[0].position.x, y: selected[0].position.y },
      dragHandle: '.drag-handle',
      data: {
        question: summaryQuestion,
        response: '',
        responses: [''],
        responseIndex: 0,
        isCollapsed: false,
        isEditing: false,
        isEditingResponse: false,
        isLoading: true,
        tokenCount: 0,
        highlights: [],
        highlightMode: 'tag',
        attachments: [],
        excludedAttachmentIds: [], includedAttachmentIds: [],
        inheritRole: true,
        roleMode: 'inherit' as const,
        isRoot: !parentId,
        isBranch: false,
      },
    };

    // Edge from parent (if any)
    const newEdge: ThoughtEdge | null = parentId ? {
      id: `edge-${parentId}-${id}`,
      source: parentId,
      target: id,
      type: 'smoothstep',
      style: { stroke: '#6B5CE7', strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed' as const, color: '#6B5CE7', width: 16, height: 16 },
    } : null;

    get().pushHistory();
    const newEdges = newEdge ? [...edges, newEdge] : [...edges];
    const newNodes = autoLayout([...nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id, selectedNodeIds: [] });

    // Call LLM to summarize
    try {
      const messages: ContextMessage[] = [
        { role: 'system', content: `You merge conversation nodes. CRITICAL: Your output language MUST match the primary language of the user content. If the content is in Chinese, respond in Chinese. If English, respond in English. Never use German or any other language unless the content is in that language. Do not translate — use the same language as the source.` },
        { role: 'user', content: `将以下 ${selected.length} 个对话节点合并为一份完整文档。(Merge the following ${selected.length} conversation nodes into one comprehensive document.)

规则 / Rules:
1. 输出语言必须与下面内容的主要语言一致。(Output language must match the primary language of the content below.)
2. 去除重复：移除跨节点的冗余信息。(Deduplicate: remove redundant info across nodes.)
3. 保留完整性：保留所有独特观点、结论、数据。不要过度压缩——目标是合并，不是摘要。(Preserve completeness: keep all unique insights. Goal is consolidation, not compression.)
4. 结构清晰：用标题或要点组织。(Structure clearly with headings or bullets.)
5. 只输出合并后的内容，不要元评论。(Output ONLY the merged content.)

内容 / Content:

${mergedContent}` },
      ];

      let fullResponse = '';
      await llmCallStream(messages, (chunk) => {
        fullResponse += chunk;
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, response: fullResponse, responses: [fullResponse] } } : n
          ),
        }));
      });

      const tokenCount = countTokens(summaryQuestion + fullResponse);
      set((state) => ({
        nodes: autoLayout(
          state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, response: fullResponse, responses: [fullResponse], isLoading: false, isCollapsed: true, tokenCount } } : n
          ),
          state.edges
        ),
      }));
      // Generate summary
      const setSummary = get().setSummary;
      generateSummary(id, summaryQuestion, fullResponse, setSummary);

      // Delete original nodes if requested
      if (deleteAfter) {
        const allRemove = new Set<string>();
        for (const nid of nodeIds) {
          allRemove.add(nid);
          for (const d of getDescendantIds(nid, get().edges)) {
            allRemove.add(d);
          }
        }
        // Don't delete the newly created merge node
        allRemove.delete(id);
        set((state) => ({
          nodes: autoLayout(
            state.nodes.filter((n) => !allRemove.has(n.id)),
            state.edges.filter((e) => !allRemove.has(e.source) && !allRemove.has(e.target))
          ),
          edges: state.edges.filter((e) => !allRemove.has(e.source) && !allRemove.has(e.target)),
        }));
      }

      get().pushHistory();
    } catch {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, response: 'Error generating summary.', isLoading: false, isCollapsed: true } } : n
        ),
      }));
    }
  },

  stopGeneration: (nodeId: string) => {
    const controller = activeAbortControllers.get(nodeId);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(nodeId);
    }
  },

  addAttachment: (nodeId: string, attachment: Attachment) => {
    // Dedup: skip if same file already on this node (name + size + content prefix)
    const existing = get().nodes.find((n) => n.id === nodeId)?.data.attachments || [];
    const fingerprint = `${attachment.name}|${attachment.size}|${attachment.content?.substring(0, 100)}`;
    if (existing.some((a) => `${a.name}|${a.size}|${a.content?.substring(0, 100)}` === fingerprint)) {
      console.log(`[Attachment] Skipping duplicate: ${attachment.name}`);
      return;
    }
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, attachments: [...(n.data.attachments || []), attachment] } }
          : n
      ),
    }));
    get().pushHistory();
  },

  removeAttachment: (nodeId: string, attachmentId: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, attachments: (n.data.attachments || []).filter((a) => a.id !== attachmentId) } }
          : n
      ),
    }));
    get().pushHistory();
  },

  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const excluded = n.data.excludedAttachmentIds || [];
        const included = n.data.includedAttachmentIds || [];
        const isExcludedSelf = excluded.includes(attachmentId);
        const isIncludedOverride = included.includes(attachmentId);

        if (ancestorExcluded && !isIncludedOverride) {
          // Ancestor excluded this → add to includedAttachmentIds to override
          return { ...n, data: { ...n.data, includedAttachmentIds: [...included, attachmentId] } };
        } else if (ancestorExcluded && isIncludedOverride) {
          // Was overriding ancestor exclusion → remove override (respect ancestor exclusion)
          return { ...n, data: { ...n.data, includedAttachmentIds: included.filter((id) => id !== attachmentId) } };
        } else if (isExcludedSelf) {
          // Self-excluded → un-exclude
          return { ...n, data: { ...n.data, excludedAttachmentIds: excluded.filter((id) => id !== attachmentId) } };
        } else {
          // Not excluded → exclude
          return { ...n, data: { ...n.data, excludedAttachmentIds: [...excluded, attachmentId] } };
        }
      }),
    }));
    get().pushHistory();
  },

  setAttachmentData: (nodeId: string, attachmentId: string, data: Partial<Attachment>) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, attachments: (n.data.attachments || []).map((a) =>
          a.id === attachmentId ? { ...a, ...data } : a
        ) } };
      }),
    }));
  },

  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...n.data, attachments: (n.data.attachments || []).map((a) =>
          a.id === attachmentId ? { ...a, renderMode: mode } : a
        ) } };
      }),
    }));
  },

  getInheritedAttachments: (nodeId: string) => {
    const { nodes, edges } = get();
    const result: { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[] = [];
    const seenFingerprints = new Set<string>();
    const visited = new Set<string>();
    const ordered: typeof nodes = [];

    function walkUp(id: string) {
      if (visited.has(id)) return;
      visited.add(id);
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const incomingEdges = edges.filter((e) => e.target === id);
      for (const edge of incomingEdges) {
        walkUp(edge.source);
      }
      ordered.push(node);
    }

    walkUp(nodeId);

    // Collect all ancestor exclusions (propagation)
    const ancestorExcludes = new Set<string>();
    for (const node of ordered) {
      if (node.id !== nodeId) {
        for (const exId of (node.data.excludedAttachmentIds || [])) {
          ancestorExcludes.add(exId);
        }
      }
    }

    // Collect attachments from ancestors (not self), with dedup
    for (const node of ordered) {
      if (node.id === nodeId) continue;
      for (const att of (node.data.attachments || [])) {
        const fp = `${att.name}|${att.size}|${att.content?.substring(0, 100)}`;
        if (seenFingerprints.has(fp)) continue;
        seenFingerprints.add(fp);
        result.push({
          attachment: att,
          sourceNodeId: node.id,
          sourceQuestion: node.data.question,
          excludedByAncestor: ancestorExcludes.has(att.id),
        });
      }
    }

    return result;
  },
}), {
  name: 'thoughtdag',
  version: 1,
  storage: createJSONStorage(() => idbStorage),
  // Persist only the graph. Undo history (full-graph snapshots ×50) and
  // selection are session-scoped and would bloat the stored payload.
  partialize: (state): PersistedState => ({
    nodes: stripTransient(state.nodes),
    edges: state.edges,
  }),
  merge: (persisted, current) => {
    const p = (persisted ?? { nodes: [], edges: [] }) as PersistedState;
    const nodes = stripTransient(p.nodes ?? []);
    const edges = p.edges ?? [];
    return {
      ...current,
      nodes,
      edges,
      // The restored graph becomes the base snapshot of the undo stack.
      history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      historyIndex: 0,
    };
  },
}));

// Debug: expose store for testing (DEV only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __store: useStore, __buildContext: buildContext });
}
