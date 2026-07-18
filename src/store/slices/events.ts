import type { StateCreator } from 'zustand';
import type { CanvasOp } from '../../types';
import type { StoreState, EventSlice } from '../types';

// The canvas event log: an append-only record of semantic operations
// (form 2 of the thinking timeline; form 1 is the timestamps carried on
// the state itself). Three rules keep it honest and light:
//   append-only — undo rolls back the graph, never the log (the undo
//     itself is an event: hesitation is data);
//   metadata only — an event says something happened, the canvas holds
//     the content;
//   semantic level — view noise (drag, collapse, typing) is not logged.
// It persists with the project and travels in backups; share links never
// carry it (the viewer payload is built explicitly from nodes+edges).

const EVENT_CAP = 10_000; // runaway backstop, far above real sessions

export const createEventSlice: StateCreator<StoreState, [], [], EventSlice> = (set, get) => ({
  events: [],

  logEvent: (op: CanvasOp, id?: string, d?: Record<string, string | number | boolean>) => {
    const { events } = get();
    const next = [...events, { t: new Date().toISOString(), op, ...(id ? { id } : {}), ...(d ? { d } : {}) }];
    set({ events: next.length > EVENT_CAP ? next.slice(next.length - EVENT_CAP + 1000) : next });
  },
});
