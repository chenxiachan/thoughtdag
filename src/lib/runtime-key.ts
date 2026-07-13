import { API_BASE } from './constants';
import type { ModelData } from './use-models';

// Browser-side OpenRouter key: the .env-free path into the app. The key
// lives in localStorage and in the proxy's memory only (never on disk);
// pushRuntimeKey re-registers it, so it is safe to call on every boot —
// proxy restarts self-heal on the next page load.

export const RUNTIME_KEY_LS = 'thoughtdag.openrouterKey';
export const RUNTIME_MODELS_LS = 'thoughtdag.openrouterModels';

export const RUNTIME_DEFAULT_MODELS = [
  'openrouter/auto',
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.5',
  'google/gemini-3.1-pro-preview',
  'deepseek/deepseek-v4-pro',
  'z-ai/glm-5',
  'qwen/qwen3.7-max',
  'moonshotai/kimi-k2.6',
];

export function storedRuntimeKey(): { key: string; models: string[] } | null {
  const key = localStorage.getItem(RUNTIME_KEY_LS);
  if (!key) return null;
  const models = (localStorage.getItem(RUNTIME_MODELS_LS) ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return { key, models: models.length > 0 ? models : RUNTIME_DEFAULT_MODELS };
}

/** Register (or clear, with key='') the runtime key on the proxy. Returns the refreshed model list. */
export async function pushRuntimeKey(key: string, models?: string[]): Promise<ModelData> {
  const res = await fetch(`${API_BASE}/api/runtime-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, models }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return { models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities };
}
