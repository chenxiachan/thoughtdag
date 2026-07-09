import { useEffect, useState } from 'react';
import { API_BASE } from './constants';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  vision: boolean;
}

type ModelData = { models: ModelInfo[]; default: string | null };

// Model list is fetched once per session and shared by every picker
let cache: ModelData | null = null;
let inflight: Promise<ModelData | null> | null = null;

/** Imperative access to the same per-session model cache (e.g. picking an extraction model). */
export function getModelsOnce(): Promise<ModelData | null> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch(`${API_BASE}/api/models`)
    .then((r) => r.json())
    .then((d) => (cache = { models: d.models ?? [], default: d.default ?? null }))
    .catch(() => null);
  return inflight;
}

export function useModels(): ModelData | null {
  const [data, setData] = useState<ModelData | null>(cache);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    void getModelsOnce().then((d) => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);
  return data;
}
