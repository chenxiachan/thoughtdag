import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from '../lib/persistence';
import type { ThoughtNode } from '../types';
import type { StoreState, PersistedState } from './types';
import { buildContext } from './context-builder';
import { createHistorySlice } from './slices/history';
import { createNodeSlice } from './slices/nodes';
import { createLlmSlice } from './slices/llm';
import { createRoleSlice } from './slices/roles';
import { createHighlightSlice } from './slices/highlights';
import { createAttachmentSlice } from './slices/attachments';
import { createEvaluatorSlice } from './slices/evaluator';

// Reset transient UI flags — applied both when persisting and when rehydrating,
// so a refresh mid-stream/mid-edit never restores a node stuck in loading state.
export function stripTransient(nodes: ThoughtNode[]): ThoughtNode[] {
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

export const useStore = create<StoreState>()(persist((...a) => ({
  ...createHistorySlice(...a),
  ...createNodeSlice(...a),
  ...createLlmSlice(...a),
  ...createRoleSlice(...a),
  ...createHighlightSlice(...a),
  ...createAttachmentSlice(...a),
  ...createEvaluatorSlice(...a),
}), {
  // Placeholder name — bootProjects() (src/store/projects.ts) points this at
  // the active project's key via persist.setOptions() before rehydrating.
  name: 'thoughtdag',
  version: 1,
  skipHydration: true,
  storage: createJSONStorage(() => idbStorage),
  // Persist only the graph. Undo history (full-graph snapshots ×50) and
  // selection are session-scoped and would bloat the stored payload.
  partialize: (state): PersistedState => ({
    nodes: stripTransient(state.nodes),
    edges: state.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
  }),
  merge: (persisted, current) => {
    const p = (persisted ?? { nodes: [], edges: [] }) as PersistedState;
    const nodes = stripTransient(p.nodes ?? []);
    const edges = (p.edges ?? []).map((e) => (e.selected ? { ...e, selected: false } : e));
    return {
      ...current,
      nodes,
      edges,
      // The restored graph becomes the base snapshot of the undo stack.
      history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      historyIndex: 0,
    };
  },
  // Surface rehydration failures — zustand's hydrate() swallows them silently,
  // which would leave the app stuck behind the hydration gate.
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.error('[thoughtdag] rehydration failed:', error);
  },
}));

// Debug: expose store for testing (DEV only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __store: useStore, __buildContext: buildContext });
}
