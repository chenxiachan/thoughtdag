import type { StateCreator } from 'zustand';
import { HISTORY_LIMIT } from '../../lib/constants';
import type { StoreState, HistorySlice } from '../types';

export const createHistorySlice: StateCreator<StoreState, [], [], HistorySlice> = (set, get) => ({
  history: [{ nodes: [], edges: [] }],
  historyIndex: 0,

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
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
});
