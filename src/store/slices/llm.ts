import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge } from '../../types';
import { generateId } from '../../utils';
import { autoLayout } from '../../lib/layout';
import { getDescendantIds } from '../../lib/graph';
import { COLORS } from '../../lib/constants';
import type { ContextMessage } from '../../lib/api';
import { buildContext, resolveExplicitRole, applyRoleOverride } from '../context-builder';
import { activeAbortControllers, autoRunCounts, runNodeGeneration, triggerParadigmCascade } from '../streaming';
import type { StoreState, LlmSlice, AddQuestionOptions } from '../types';

export const createLlmSlice: StateCreator<StoreState, [], [], LlmSlice> = (set, get) => ({
  addQuestion: async (question: string, opts: AddQuestionOptions = {}) => {
    const { parentId, branchContext, branchYRatio, inheritRole, rolePrompt, initialAttachments, excludeAllInheritedAttachments } = opts;
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
        style: { stroke: COLORS.warm, strokeWidth: 2, strokeDasharray: '6 3' },
        animated: true,
        markerEnd: { type: 'arrowclosed' as const, color: COLORS.warm, width: 18, height: 18 },
        data: { isBranchFromSelection: true, branchYRatio: branchYRatio ?? 0.5 },
      } : {
        style: { stroke: COLORS.accent, strokeWidth: 2 },
        animated: false,
        markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
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

    // Build full context from ancestors + explicit role for the new node
    const selfNode = get().nodes.find((n) => n.id === id);
    const ctx = parentId
      ? buildContext(parentId, get().nodes, get().edges, branchContext, selfNode?.data.excludedAttachmentIds, selfNode?.data.includedAttachmentIds)
      : { messages: [] as ContextMessage[], images: [] };
    const contextMessages = ctx.messages;
    const contextImages = ctx.images;
    const parentNode = parentId ? get().nodes.find((n) => n.id === parentId) : null;
    applyRoleOverride(contextMessages, resolveExplicitRole(selfNode?.data, parentNode?.data, !!parentId));

    // Collect this node's own attachments (skip if same file already from ancestors)
    const selfAttachments = selfNode?.data.attachments || [];
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

    // Record the applied role before streaming
    const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
    contextMessages.push({ role: 'user', content: question });
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, appliedRole } } : n
      ),
    }));

    await runNodeGeneration(set, get, id, { question, messages: contextMessages, images: contextImages });
  },

  /**
   * Fan out: one question, N context-isolated role branches. Each branch is
   * an ordinary child node (orange branch edge, reset role) so siblings
   * can't see each other — structural blindness for candidate pools.
   * Generations run concurrently (bounded); one history entry for the batch.
   */
  fanOut: async (parentId: string, question: string, roles: { name: string; prompt: string }[]) => {
    const parent = get().nodes.find((n) => n.id === parentId);
    if (!parent || roles.length === 0) return;
    get().pushHistory();

    // Create all branch nodes and edges up front (single layout pass)
    const created: { id: string; role: { name: string; prompt: string } }[] = [];
    const newNodes: ThoughtNode[] = [];
    const newEdges: ThoughtEdge[] = [];
    for (const role of roles) {
      const id = generateId();
      created.push({ id, role });
      newNodes.push({
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
          branchContext: undefined,
          highlights: [], highlightMode: 'tag', attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
          roleMode: 'reset',
          rolePrompt: role.prompt,
          isRoot: false,
          isBranch: true, // orange styling: exploratory candidates
        },
      });
      newEdges.push({
        id: `edge-${parentId}-${id}`,
        source: parentId,
        target: id,
        sourceHandle: 'branch',
        targetHandle: 'left',
        type: 'smoothstep',
        style: { stroke: COLORS.warm, strokeWidth: 2, strokeDasharray: '6 3' },
        animated: true,
        markerEnd: { type: 'arrowclosed' as const, color: COLORS.warm, width: 18, height: 18 },
        data: { isBranchFromSelection: true, branchYRatio: 0.5 },
      });
    }

    const allEdges = [...get().edges, ...newEdges];
    const allNodes = autoLayout(
      [...get().nodes.map((n) => (n.id === parentId ? { ...n, data: { ...n.data, isCollapsed: true } } : n)), ...newNodes],
      allEdges,
    );
    set({ nodes: allNodes, edges: allEdges, selectedNodeId: null, selectedNodeIds: [] });

    // Shared ancestor context (built once — identical for every sibling)
    const ctx = buildContext(parentId, get().nodes, get().edges);

    // Bounded concurrency: free-tier providers dislike large bursts
    const LIMIT = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < created.length) {
        const { id, role } = created[cursor++];
        const messages: ContextMessage[] = [...ctx.messages.filter((m) => m.role !== 'system')];
        messages.unshift({ role: 'system', content: role.prompt });
        const appliedRole = role.prompt;
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, appliedRole } } : n)),
        }));
        messages.push({ role: 'user', content: question });
        await runNodeGeneration(set, get, id, { question, messages, images: ctx.images });
      }
    };
    await Promise.all(Array.from({ length: Math.min(LIMIT, created.length) }, worker));
  },

  submitHumanTurn: (nodeId: string, question: string) => {
    const q = question.trim();
    if (!q) return;
    get().pushHistory();
    autoRunCounts.clear(); // a human turn is a manual action: new auto wave
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, question: q, isEditing: false } } : n
      ),
    }));
    triggerParadigmCascade(get, nodeId);
  },

  editQuestion: async (nodeId: string, question: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, question, isEditing: false, isLoading: true } } : n
      ),
    }));
    // Rebuild context with this node's own Q&A blanked out
    const editNode = get().nodes.find((n) => n.id === nodeId);
    const editCtx = buildContext(nodeId, get().nodes.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, question: '', response: '' } } : n
    ), get().edges, undefined, editNode?.data.excludedAttachmentIds, editNode?.data.includedAttachmentIds);
    const contextMessages = editCtx.messages;
    const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
    contextMessages.push({ role: 'user', content: question });
    set((state) => ({ nodes: state.nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, appliedRole } } : n) }));

    await runNodeGeneration(set, get, nodeId, { question, messages: contextMessages, images: editCtx.images });
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
        roleMode: node.data.roleMode || 'inherit',
        rolePrompt: node.data.rolePrompt,
        isRoot: !parentId,
        isBranch: node.data.isBranch,
        model: node.data.model, // sibling keeps the original's model override
      },
    };

    const newEdges = parentId
      ? [...get().edges, { id: `edge-${parentId}-${id}`, source: parentId, target: id, type: 'smoothstep' }]
      : get().edges;

    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });

    const regenSelf = get().nodes.find((n) => n.id === id);
    const regenCtx = parentId
      ? buildContext(parentId, get().nodes, get().edges, node.data.branchContext, regenSelf?.data.excludedAttachmentIds, regenSelf?.data.includedAttachmentIds)
      : { messages: [] as ContextMessage[], images: [] };
    const contextMessages = regenCtx.messages;
    const regenParent = parentId ? get().nodes.find((n) => n.id === parentId) : null;
    applyRoleOverride(contextMessages, resolveExplicitRole(regenSelf?.data, regenParent?.data, !!parentId));

    const appliedRole = contextMessages.find((m) => m.role === 'system')?.content || undefined;
    contextMessages.push({ role: 'user', content: node.data.question });
    set((state) => ({ nodes: state.nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, appliedRole } } : n) }));

    await runNodeGeneration(set, get, id, { question: node.data.question, messages: contextMessages, images: regenCtx.images });
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
      style: { stroke: COLORS.accent, strokeWidth: 2 },
      animated: false,
      markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
      data: {},
    } : null;

    const newEdges = newEdge ? [...get().edges, newEdge] : get().edges;
    const newNodes = autoLayout([...get().nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id });

    const distillCtx = parentEdge
      ? buildContext(parentEdge.source, get().nodes, get().edges)
      : { messages: [] as ContextMessage[], images: [] };
    const contextMessages = distillCtx.messages;
    contextMessages.push({ role: 'user', content: node.data.question });
    contextMessages.push({
      role: 'user',
      content: `Based on the following highlighted key content, regenerate a more concise response. Keep these key points, remove redundancy:\n\n${highlightTexts}`,
    });

    await runNodeGeneration(set, get, id, { question: node.data.question, messages: contextMessages });
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
      style: { stroke: COLORS.accent, strokeWidth: 2 },
      markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
    } : null;

    get().pushHistory();
    const newEdges = newEdge ? [...edges, newEdge] : [...edges];
    const newNodes = autoLayout([...nodes, newNode], newEdges);
    set({ nodes: newNodes, edges: newEdges, selectedNodeId: id, selectedNodeIds: [] });

    const messages: ContextMessage[] = [
      { role: 'system', content: `You merge conversation nodes. CRITICAL: Your output language MUST match the primary language of the user content. If the content is in Chinese, respond in Chinese. If English, respond in English. Never use German or any other language unless the content is in that language. Do not translate — use the same language as the source.` },
      { role: 'user', content: `将以下 ${selected.length} 个对话节点合并为一份完整文档。(Merge the following ${selected.length} conversation nodes into one comprehensive document.)

规则 / Rules:
1. 输出语言必须与下面内容的主要语言一致。(Output language must match the primary language of the content below.)
2. 这是综合(synthesis)，不是流水摘要：提炼出经过这些讨论后「我们现在知道什么」。(This is a SYNTHESIS, not a running summary: distill what we NOW KNOW after these discussions.)
3. 按此结构组织 / Structure:
   - **结论 (Conclusions)** — 立得住的要点，合并重复表述 (consolidated takeaways, dedup repeated points)
   - **依据 (Key evidence)** — 支撑结论的关键论据/数据/引用 (the arguments, data or citations that carry the conclusions)
   - **分歧与未决 (Open questions)** — 节点间的矛盾之处与尚未回答的问题 (contradictions between nodes and what remains unanswered)
4. 保留所有独特洞见与引用标注，丢弃寒暄和重复。(Keep every unique insight and citation marker; drop filler and repetition.)
5. 只输出综合后的内容，不要元评论。(Output ONLY the synthesis.)

内容 / Content:

${mergedContent}` },
    ];

    await runNodeGeneration(set, get, id, {
      question: summaryQuestion,
      messages,
      onSuccess: () => {
        // Re-layout with the summary node's final height, then optionally
        // delete the merged originals (and their descendants)
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
            nodes: state.nodes.filter((n) => !allRemove.has(n.id)),
            edges: state.edges.filter((e) => !allRemove.has(e.source) && !allRemove.has(e.target)),
          }));
        }
        set((state) => ({ nodes: autoLayout(state.nodes, state.edges) }));
      },
    });
  },

  stopGeneration: (nodeId: string) => {
    const controller = activeAbortControllers.get(nodeId);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(nodeId);
    }
  },
});
