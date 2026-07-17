import { API_BASE } from './constants';
import type { ModelData } from './use-models';

// Browser-configured model providers: the .env-free path in. Anything that
// speaks the OpenAI-compatible protocol fits one shape — baseURL + key +
// model list. Presets carry only the baseURL (stable for years) and where
// to get a key; the MODEL LIST is always fetched live from the endpoint's
// /models route, so new releases never require a code change here.
// Keys live in localStorage and the proxy's memory only, never on disk.

export interface RuntimeModel { id: string; vision?: boolean }
export interface RuntimeProvider {
  preset: string; // preset id or 'custom'
  name: string;   // display name (also the provider tag on models)
  baseURL: string;
  apiKey: string; // '' for keyless endpoints (local runtimes)
  models: RuntimeModel[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseURL: string;
  keyUrl?: string;
  /** No key input (local runtimes). */
  noKey?: boolean;
  /** Preselect these when the probed list contains them. */
  recommend?: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    recommend: ['openrouter/auto', 'anthropic/claude-sonnet-5', 'openai/gpt-5.5', 'google/gemini-3.1-pro-preview', 'deepseek/deepseek-v4-pro', 'z-ai/glm-5', 'qwen/qwen3.7-max', 'moonshotai/kimi-k2.6'],
  },
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'zhipu', name: 'Zhipu GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'https://open.bigmodel.cn' },
  { id: 'moonshot', name: 'Kimi (Moonshot)', baseURL: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1', noKey: true },
  { id: 'custom', name: '', baseURL: '' },
];

const LS_KEY = 'thoughtdag.providers';
const LEGACY_KEY = 'thoughtdag.openrouterKey';
const LEGACY_MODELS = 'thoughtdag.openrouterModels';

/** Stored providers, migrating the legacy single-OpenRouter-key format. */
export function storedProviders(): RuntimeProvider[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as RuntimeProvider[];
  } catch { /* fall through to legacy/empty */ }
  const legacyKey = localStorage.getItem(LEGACY_KEY);
  if (legacyKey) {
    const models = (localStorage.getItem(LEGACY_MODELS) ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const migrated: RuntimeProvider[] = [{
      preset: 'openrouter', name: 'OpenRouter',
      baseURL: 'https://openrouter.ai/api/v1', apiKey: legacyKey,
      models: (models.length > 0 ? models : PROVIDER_PRESETS[0].recommend!).map((id) => ({ id })),
    }];
    saveProviders(migrated);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_MODELS);
    return migrated;
  }
  return [];
}

export function saveProviders(providers: RuntimeProvider[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(providers));
}

/** Register the full provider set on the proxy; returns the refreshed model list. */
export async function pushProviders(providers: RuntimeProvider[]): Promise<ModelData> {
  const res = await fetch(`${API_BASE}/api/runtime-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return { models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities };
}

/** Ask an endpoint what models it serves (the /models protocol standard). */
export async function probeModels(baseURL: string, apiKey: string): Promise<RuntimeModel[]> {
  const res = await fetch(`${API_BASE}/api/probe-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseURL, apiKey: apiKey || undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return ((await res.json()).models ?? []) as RuntimeModel[];
}

/** Re-probe every stored provider: picked models kept, metadata updated,
    delisted ids dropped; small catalogs adopt new models automatically. */
export async function refreshStoredProviders(): Promise<ModelData | null> {
  const stored = storedProviders();
  if (stored.length === 0) return null;
  const next: RuntimeProvider[] = [];
  for (const p of stored) {
    try {
      const fresh = await probeModels(p.baseURL, p.apiKey);
      const had = new Map(p.models.map((m) => [m.id, m]));
      const rec = new Set(PROVIDER_PRESETS.find((x) => x.baseURL === p.baseURL)?.recommend ?? []);
      const small = fresh.length <= 40;
      const models = fresh
        .filter((m) => had.has(m.id) || rec.has(m.id) || small)
        .map((m) => ({ id: m.id, ...(m.vision !== undefined ? { vision: m.vision } : had.get(m.id)?.vision ? { vision: true } : {}) }));
      next.push(models.length > 0 ? { ...p, models } : p);
    } catch { next.push(p); } // unreachable endpoint: keep the stored entry
  }
  const data = await pushProviders(next);
  saveProviders(next);
  return data;
}
