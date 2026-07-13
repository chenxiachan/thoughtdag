import { useEffect, useState } from 'react';
import { API_BASE } from './constants';
import { storedRuntimeKey, pushRuntimeKey } from './runtime-key';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  vision: boolean;
}

export interface Capabilities {
  webSearch: boolean;
  searchEngine: string;
  scholarSearch: boolean;
  vision: boolean;
}

export type ModelData = { models: ModelInfo[]; default: string | null; capabilities?: Capabilities };

// Model list is fetched once per session and shared by every picker
let cache: ModelData | null = null;
let inflight: Promise<ModelData | null> | null = null;
const listeners = new Set<(d: ModelData) => void>();

/** Imperative access to the same per-session model cache (e.g. picking an extraction model). */
export function getModelsOnce(): Promise<ModelData | null> {
  if (cache) return Promise.resolve(cache);
  inflight ??= (async () => {
    // a browser-stored key re-registers itself before the first list fetch
    // (the proxy holds runtime keys in memory only, so restarts forget them)
    const stored = storedRuntimeKey();
    if (stored) {
      try {
        return (cache = await pushRuntimeKey(stored.key, stored.models));
      } catch { /* invalid key or proxy down: fall through to the plain list */ }
    }
    return fetch(`${API_BASE}/api/models`)
      .then((r) => r.json())
      .then((d) => (cache = { models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities }))
      .catch(() => null);
  })();
  return inflight;
}

/** Replace the shared cache (after a runtime-key change) and notify every subscribed picker. */
export function setModelsCache(d: ModelData): void {
  cache = d;
  inflight = Promise.resolve(d);
  for (const fn of listeners) fn(d);
}

export function useModels(): ModelData | null {
  const [data, setData] = useState<ModelData | null>(cache);
  useEffect(() => {
    const fn = (d: ModelData) => setData(d);
    listeners.add(fn);
    if (!cache) {
      void getModelsOnce().then((d) => { if (listeners.has(fn) && d) setData(d); });
    }
    return () => { listeners.delete(fn); };
  }, []);
  return data;
}
