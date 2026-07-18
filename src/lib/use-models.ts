import { useEffect, useState } from 'react';
import { API_BASE } from './constants';
import { storedProviders, pushProviders } from './runtime-providers';

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
    // browser-stored providers re-register themselves before the first list
    // fetch (the proxy holds them in memory only, so restarts forget them)
    const stored = storedProviders();
    if (stored.length > 0) {
      try {
        return (cache = await pushProviders(stored));
      } catch { /* proxy down or bad config: fall through to the plain list */ }
    }
    return fetch(`${API_BASE}/api/models`)
      .then((r) => r.json())
      .then((d) => (cache = { models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities }))
      .catch(() => null);
  })();
  return inflight;
}

/** Family-level id for cross-provider comparison: the gateway slug
    'deepseek/deepseek-v4-pro' and the direct id 'deepseek-v4-pro' are the
    same model reached through different doors. */
function modelBasename(id: string): string {
  return (id.split('/').pop() ?? id).toLowerCase();
}

/** Reconcile a pinned model id against the locally available list: exact id
    → itself; same family under a different provider → the local id;
    otherwise null (not reachable here). */
export function reconcileModelId(pinned: string, models: ModelInfo[]): string | null {
  if (models.some((m) => m.id === pinned)) return pinned;
  const base = modelBasename(pinned);
  const match = models.find((m) => modelBasename(m.id) === base);
  return match ? match.id : null;
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
