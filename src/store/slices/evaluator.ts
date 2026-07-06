import type { StateCreator } from 'zustand';
import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../../types';
import { generateId } from '../../utils';
import { COLORS } from '../../lib/constants';
import { buildContext } from '../context-builder';
import { runNodeGeneration } from '../streaming';
import type { StoreState, EvaluatorSlice } from '../types';

// ── Primitives, not features ─────────────────────────────────────
// A "reviewer" is NOT a special node type. It is an ordinary node composed
// from two generic primitives:
//   • autoRerun  (node) — regenerate in place whenever an upstream ancestor
//                          finishes generating (versions accumulate)
//   • followsTip (edge) — the edge keeps sliding forward to the newest node
//                          of the thread it points from
// attachEvaluator below is merely a PRESET that combines them with a
// critic role. Any node can use either primitive for other purposes
// (live summaries, running translations, ...).

/** autoRerun with legacy fallback: old graphs stored evaluatorTrigger. */
export function isAutoRerun(data: ThoughtData): boolean {
  return data.autoRerun ?? data.evaluatorTrigger === 'auto';
}

export const createEvaluatorSlice: StateCreator<StoreState, [], [], EvaluatorSlice> = (set, get) => ({
  /**
   * Regenerate a node IN PLACE from its incoming edges (standard context
   * walk — same one every node uses), appending to its version history.
   * This is the generic engine behind auto-rerun; also useful manually.
   */
  rerunNode: async (nodeId: string) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.data.isLoading) return;
    if (!edges.some((e) => e.target === nodeId)) return; // nothing upstream to rerun from

    // Standard context with this node's own Q&A blanked out (same pattern
    // as editQuestion) — ancestors, roles, highlights, attachments all
    // resolve exactly like any other generation.
    const ctx = buildContext(
      nodeId,
      nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, question: '', response: '' } } : n)),
      edges,
      undefined,
      node.data.excludedAttachmentIds,
      node.data.includedAttachmentIds,
    );
    const messages = ctx.messages;
    const appliedRole = messages.find((m) => m.role === 'system')?.content || undefined;
    messages.push({ role: 'user', content: node.data.question });

    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, appliedRole, isLoading: true, isCollapsed: false, response: '' } } : n
      ),
    }));

    await runNodeGeneration(set, get, nodeId, {
      question: node.data.question,
      messages,
      images: ctx.images,
      versionMode: 'append',
    });
  },

  setAutoRerun: (nodeId: string, enabled: boolean) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, autoRerun: enabled, evaluatorTrigger: undefined } }
          : n
      ),
    }));
  },

  /**
   * PRESET: attach a critic to a thread. Creates an ordinary node with a
   * reviewer persona + autoRerun, wired by a followsTip edge — nothing
   * here is special-cased anywhere else in the app.
   */
  attachEvaluator: async (watchedNodeId: string, rolePrompt: string, roleName: string) => {
    const watched = get().nodes.find((n) => n.id === watchedNodeId);
    if (!watched) return;
    get().pushHistory();

    const id = generateId();
    const reviewerNode: ThoughtNode = {
      id,
      type: 'thought',
      position: { x: watched.position.x + 640, y: watched.position.y },
      dragHandle: '.drag-handle',
      data: {
        // The question IS the standing instruction — rerun executes it
        // against whatever the followsTip edge currently points at.
        question: `[${roleName}] Critique the discussion above: identify overclaims, missing evidence, and unstated assumptions. Note what improved since the previous version if any. Be concise and specific. Respond in the language of the discussion.`,
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
        roleMode: 'reset', // the critic's persona stays its own
        isRoot: false,
        isBranch: false,
        isEvaluator: true, // visual identity only (red theme + badge)
        autoRerun: true,
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
      data: { isCrossLink: true, isWatch: true, followsTip: true },
    };

    set((state) => ({
      nodes: [...state.nodes, reviewerNode],
      edges: [...state.edges, watchEdge],
      selectedNodeId: id,
      selectedNodeIds: [id],
    }));
    get().pushHistory();

    await get().rerunNode(id);
  },
});
