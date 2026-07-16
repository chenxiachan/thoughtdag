import type { StateCreator } from 'zustand';
import { HISTORY_LIMIT } from '../../lib/constants';
import type { StoreState, HistorySlice } from '../types';

// Undo snapshots are SHALLOW references, not deep copies. Every store
// update is immutable (map + spread; React Flow's applyNodeChanges too),
// so a snapshot's arrays and objects are never mutated after the fact —
// structural sharing makes snapshots O(1) instead of a full serialize of
// every attachment. With PDF-heavy canvases (base64 content + page
// images on nodes) the deep copy was 100-400ms per interaction and up
// to 50× the store size in memory; shallow is microseconds and ~1×.
// INVARIANT this relies on: never mutate a node/edge object that has
// entered the store — always map to fresh objects.

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  history: [{ nodes: [], edges: [] }],
  historyIndex: 0,

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes, edges });
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({ nodes: prev.nodes, edges: prev.edges, historyIndex: historyIndex - 1 });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({ nodes: next.nodes, edges: next.edges, historyIndex: historyIndex + 1 });
  },
});
