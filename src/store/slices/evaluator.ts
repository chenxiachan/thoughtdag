import type { StateCreator } from 'zustand';
import type { ThoughtData } from '../../types';
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
  rerunNode: async (nodeId: string, opts?: { auto?: boolean }) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.data.isLoading) return;
    // In-place regenerate works for anything with a question — roots included
    // (their context is just role + question). Material/frames never generate.
    if (!node.data.question) return;
    if (['note', 'file', 'link', 'frame'].includes(node.data.stepKind ?? '')) return;

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
      get().staleIds,
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
      autoChain: opts?.auto,
    });
  },

  setAutoRerunRounds: (nodeId: string, rounds: number) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, autoRerunRounds: rounds } } : n
      ),
    }));
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

  // NOTE: the old attachEvaluator preset dissolved into fanOut(follow: true)
  // — a reviewer is N=1 perspectives with the "keep reviewing" run policy.
});
