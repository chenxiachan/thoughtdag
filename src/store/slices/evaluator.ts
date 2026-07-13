import type { StateCreator } from 'zustand';
import type { ThoughtData } from '../../types';
import { buildContext } from '../context-builder';
import { runNodeGeneration, autoRunCounts } from '../streaming';
import { toast, updateToast, useUiStore } from '../../lib/ui-store';
import { t, fmt } from '../../i18n';
import type { StoreState, EvaluatorSlice } from '../types';

// Batch-replay cancellation flag — one replay at a time, module-scoped.
let replayAborted = false;

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

    // Digest nodes regenerate through the digest prompt against the source
    // attachment's full extracted text — not the context walk (the walk
    // would summarize the summary once versions accumulate).
    if (node.data.digestOf) {
      const material = nodes.find((n) => n.data.attachments?.some((a) => a.id === node.data.digestOf));
      const att = material?.data.attachments?.find((a) => a.id === node.data.digestOf);
      if (!att?.extractedText?.trim()) return;
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, isLoading: true, isCollapsed: false, response: '' } } : n
        ),
      }));
      await runNodeGeneration(set, get, nodeId, {
        question: node.data.question,
        messages: [{ role: 'user', content: `${t('content.digestPrompt')}\n\n[Material: ${att.name}]\n${att.extractedText.slice(0, 120000)}` }],
        versionMode: 'append',
        autoChain: opts?.auto,
      });
      return;
    }

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

  /**
   * Batch replay: re-run every node that was stale AT CONFIRMATION TIME,
   * in dependency order (a node runs only after all its stale structural
   * parents finished). The snapshot rule keeps the confirm-dialog count
   * honest and stops the run from chasing reference-edge contagion — nodes
   * that turn stale DURING the replay keep their badges for the human.
   */
  replayStale: async () => {
    replayAborted = false;
    get().recomputeStaleness();
    const snapshot = [...get().staleIds];
    if (snapshot.length === 0) return;
    autoRunCounts.clear(); // one user action = one auto-rerun wave
    const structural = () => get().edges.filter((e) => !e.data?.isCrossLink);
    const remaining = new Set(snapshot);
    let done = 0;
    const progress = toast('info', fmt(t('replay.progress'), { done, total: snapshot.length }), 0, {
      label: t('replay.stop'),
      run: () => { replayAborted = true; },
    });
    try {
      while (remaining.size > 0 && !replayAborted) {
        const ready = [...remaining].filter((id) =>
          !structural().some((e) => e.target === id && remaining.has(e.source)));
        if (ready.length === 0) break; // safety: no cycle exists on solid edges
        await Promise.all(ready.map((id) => get().rerunNode(id, { auto: true })));
        for (const id of ready) remaining.delete(id);
        done += ready.length;
        updateToast(progress, fmt(t('replay.progress'), { done, total: snapshot.length }));
      }
    } finally {
      useUiStore.getState().dismissToast(progress);
      get().recomputeStaleness();
      toast('success', replayAborted
        ? fmt(t('replay.stopped'), { done, total: snapshot.length })
        : fmt(t('replay.done'), { done }));
    }
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
