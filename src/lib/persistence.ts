import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

// Debounced async storage backed by IndexedDB.
// IndexedDB, not localStorage: attachments carry base64 payloads (PDF page
// images can be tens of MB) far beyond the ~5MB localStorage quota.
// Debounced because streaming writes one state update per chunk; the trailing
// write is flushed on pagehide/visibility-hidden so a quick tab close loses
// at most WRITE_DELAY_MS of the in-flight response.
const WRITE_DELAY_MS = 1000;

let pending: { name: string; value: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending) {
    const { name, value } = pending;
    pending = null;
    void idbSet(name, value);
  }
}

// Awaitable flush — used before switching projects so the outgoing
// project's debounced write lands under its own key.
export async function flushPendingWrites(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending) {
    const { name, value } = pending;
    pending = null;
    await idbSet(name, value);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: (name, value) => {
    pending = { name, value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY_MS);
  },
  removeItem: async (name) => {
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await idbDel(name);
  },
};
