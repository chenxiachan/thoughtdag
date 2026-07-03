import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge, Attachment } from '../../types';
import { generateId, countTokens } from '../../utils';
import { autoLayout } from '../../lib/layout';
import { getDescendantIds } from '../../lib/graph';
import { llmCallStream, type ContextMessage } from '../../lib/api';
import { buildContext } from '../context-builder';
import { generateSummary, activeAbortControllers } from '../streaming';
import type { StoreState, LlmSlice } from '../types';

export const createLlmSlice: StateCreator<StoreState, [], [], LlmSlice> = (set, get) => ({
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
});
