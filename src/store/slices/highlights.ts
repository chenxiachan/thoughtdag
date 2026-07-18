import type { StateCreator } from 'zustand';
import type { Highlight } from '../../types';
import type { StoreState, HighlightSlice } from '../types';

export const createHighlightSlice: StateCreator<StoreState, [], [], HighlightSlice> = (set, get) => ({
  addHighlight: (nodeId: string, highlight: Highlight) => {
    get().pushHistory();
    get().logEvent('highlight-add', nodeId, { chars: highlight.text.length });
    // Normalize: collapse whitespace/newlines to single space
    const normalizedHighlight = { at: new Date().toISOString(), ...highlight, text: highlight.text.replace(/\s+/g, ' ').trim() };
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
    get().logEvent('highlight-remove', nodeId);
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

  setSummary: (nodeId: string, summary: string, forResponse: string, type?: string) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const idx = n.data.responses.indexOf(forResponse);
        if (idx === -1) return n; // the version was edited/deleted meanwhile
        const summaries = [...(n.data.summaries ?? [])];
        summaries[idx] = summary;
        const summaryTypes = [...(n.data.summaryTypes ?? [])];
        summaryTypes[idx] = type ?? 'insight';
        return { ...n, data: { ...n.data, summaries, summaryTypes } };
      }),
    }));
  },
});
