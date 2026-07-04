import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge } from '../../types';
import { generateId } from '../../utils';
import { getDescendantIds } from '../../lib/graph';
import { COLORS } from '../../lib/constants';
import type { ContextMessage } from '../../lib/api';
import { runNodeGeneration } from '../streaming';
import type { StoreState, EvaluatorSlice } from '../types';

// Collect the watched thread (each watched node + its structural subtree)
// as a readable Q/A transcript, top-to-bottom.
function watchedTranscript(evaluatorId: string, nodes: ThoughtNode[], edges: ThoughtEdge[]): string {
  const watchedIds = new Set<string>();
  for (const e of edges) {
    if (e.target === evaluatorId && e.data?.isWatch) {
      watchedIds.add(e.source);
      for (const d of getDescendantIds(e.source, edges)) watchedIds.add(d);
    }
  }
  const thread = nodes
    .filter((n) => watchedIds.has(n.id) && !n.data.isEvaluator)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return thread
    .map((n) => `Q: ${n.data.question}\nA: ${n.data.response || '(no answer yet)'}`)
    .join('\n\n---\n\n');
}

export const createEvaluatorSlice: StateCreator<StoreState, [], [], EvaluatorSlice> = (set, get) => ({
  attachEvaluator: async (watchedNodeId: string, rolePrompt: string, roleName: string) => {
    const watched = get().nodes.find((n) => n.id === watchedNodeId);
    if (!watched) return;
    get().pushHistory();

    const id = generateId();
    const evaluatorNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: watched.position.x + 640, y: watched.position.y },
      dragHandle: '.drag-handle',
      data: {
        question: roleName,
        response: '',
        responses: [],
        responseIndex: -1,
        isCollapsed: false,
        isEditing: false,
        isEditingResponse: false,
        isLoading: false,
        tokenCount: 0,
        highlights: [], highlightMode: 'tag', attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        rolePrompt,
        appliedRole: rolePrompt,
        roleMode: 'reset', // the critic's persona stays its own
        isRoot: false,
        isBranch: false,
        isEvaluator: true,
        evaluatorTrigger: 'auto',
      },
    };

    const watchEdge: ThoughtEdge = {
      id: `watch-${watchedNodeId}-${id}`,
      source: watchedNodeId,
      target: id,
      sourceHandle: 'branch',
      targetHandle: 'left',
      type: 'smoothstep',
      style: { stroke: COLORS.watch, strokeWidth: 2, strokeDasharray: '4 4' },
      animated: true,
      markerEnd: { type: 'arrowclosed' as const, color: COLORS.watch, width: 18, height: 18 },
      data: { isCrossLink: true, isWatch: true },
    };

    set((state) => ({
      nodes: [...state.nodes, evaluatorNode],
      edges: [...state.edges, watchEdge],
      selectedNodeId: id,
      selectedNodeIds: [id],
    }));
    get().pushHistory();

    await get().evaluateNow(id);
  },

  evaluateNow: async (evaluatorId: string) => {
    const { nodes, edges } = get();
    const evaluator = nodes.find((n) => n.id === evaluatorId);
    if (!evaluator?.data.isEvaluator || evaluator.data.isLoading) return;

    const transcript = watchedTranscript(evaluatorId, nodes, edges);
    if (!transcript) return;

    const previous = evaluator.data.response;
    const messages: ContextMessage[] = [
      { role: 'system', content: evaluator.data.rolePrompt || 'You are a critical reviewer. Respond in the same language as the content under review.' },
      {
        role: 'user',
        content: previous
          ? `You are watching a conversation thread. Current state:\n\n${transcript}\n\nYour previous critique was:\n${previous}\n\nProvide an updated critique. Focus on what changed since your last review, note which of your earlier points were addressed, and raise anything you previously missed. Be concise.`
          : `You are watching a conversation thread. Here it is:\n\n${transcript}\n\nProvide your critique. Be concise and specific.`,
      },
    ];

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === evaluatorId ? { ...n, data: { ...n.data, isLoading: true, isCollapsed: false, response: '' } } : n
      ),
    }));

    await runNodeGeneration(set, get, evaluatorId, {
      question: evaluator.data.question,
      messages,
      versionMode: 'append',
    });
  },

  setEvaluatorTrigger: (nodeId: string, mode: 'auto' | 'manual') => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, evaluatorTrigger: mode } } : n
      ),
    }));
  },
});
