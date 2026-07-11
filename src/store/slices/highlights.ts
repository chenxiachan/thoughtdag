import type { StateCreator } from 'zustand';
import type { Highlight } from '../../types';
import type { StoreState, HighlightSlice } from '../types';

export const createHighlightSlice: StateCreator<StoreState, [], [], HighlightSlice> = (set, get) => ({
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

  setSummary: (nodeId: string, summary: string, forResponse: string) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const idx = n.data.responses.indexOf(forResponse);
        if (idx === -1) return n; // the version was edited/deleted meanwhile
        const summaries = [...(n.data.summaries ?? [])];
        summaries[idx] = summary;
        return { ...n, data: { ...n.data, summaries } };
      }),
    }));
  },
});
