import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

// Debounced async storage backed by IndexedDB.
// IndexedDB, not localStorage: attachments carry base64 payloads (PDF page
// images can be tens of MB) far beyond the ~5MB localStorage quota.
//
// OBJECT storage, not createJSONStorage: the JSON wrapper stringifies the
// whole graph SYNCHRONOUSLY on every set() — the debounce only guarded the
// IDB write, not the serialize, so attachment-heavy canvases paid 50-100ms
// per streamed chunk. Here setItem holds a cheap object reference and the
// debounced flush hands the object straight to IndexedDB, whose structured
// clone replaces JSON.stringify entirely.
//
// Debounced because streaming writes one state update per chunk; the
// trailing write is flushed on pagehide/visibility-hidden so a quick tab
// close loses at most WRITE_DELAY_MS of the in-flight response.
const WRITE_DELAY_MS = 1000;

let pending: { name: string; value: unknown } | null = null;
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

/** Object-level persist storage. Generic over the persisted shape. */
export function createIdbObjectStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      const v = await idbGet(name);
      if (v == null) return null;
      // Back-compat: earlier builds stored the JSON string createJSONStorage wrote
      if (typeof v === 'string') {
        try { return JSON.parse(v) as StorageValue<S>; } catch { return null; }
      }
      return v as StorageValue<S>;
    },
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
}
