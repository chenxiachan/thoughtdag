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

export function useModels(): ModelData | null {
  const [data, setData] = useState<ModelData | null>(cache);
  useEffect(() => {
    if (cache) return;
    inflight ??= fetch(`${API_BASE}/api/models`)
      .then((r) => r.json())
      .then((d) => (cache = { models: d.models ?? [], default: d.default ?? null }))
      .catch(() => null);
    let cancelled = false;
    void inflight.then((d) => { if (!cancelled && d) setData(d); });
    return () => { cancelled = true; };
  }, []);
  return data;
}
