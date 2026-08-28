import { API_BASE } from './constants';
import { errorText } from './error-text';
import type { ModelData } from './use-models';

// Browser-configured model providers: the .env-free path in. Anything that
// speaks the OpenAI-compatible protocol fits one shape — baseURL + key +
// model list. Presets carry only the baseURL (stable for years) and where
// to get a key; the MODEL LIST is always fetched live from the endpoint's
// /models route, so new releases never require a code change here.
// Keys live in localStorage and the proxy's memory only, never on disk.

export interface RuntimeModel { id: string; vision?: boolean; created?: number; contextLength?: number }
export interface RuntimeProvider {
  preset: string; // preset id or 'custom'
  name: string;   // display name (also the provider tag on models)
  baseURL: string;
  apiKey: string; // '' for keyless endpoints (local runtimes)
  models: RuntimeModel[];
}

export interface ProviderPreset {
  /** Region twin: shown only when the UI language matches (undefined = always). */
  region?: 'zh' | 'en';
  id: string;
  name: string;
  baseURL: string;
  keyUrl?: string;
  /** No key input (local runtimes). */
  noKey?: boolean;
  /** i18n key for a preset-specific setup hint (defaults to provider.localHint). */
  hintKey?: string;
  /** Preselect these when the probed list contains them. */
  recommend?: string[];
  /** Endpoint publishes no /models route: the preset carries its catalog
      and probing is skipped (MiniMax is the known case). */
  fixedModels?: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // OpenRouter leads: one key reaches 300+ models, free-tier ones included
  // — the widest first door. GLM next: a generous free tier with the fewest
  // integration quirks (international endpoint shown on the en UI).
  {
    id: 'openrouter', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    recommend: ['openrouter/auto', 'anthropic/claude-sonnet-5', 'openai/gpt-5.5', 'google/gemini-3.1-pro-preview', 'deepseek/deepseek-v4-pro', 'z-ai/glm-5', 'qwen/qwen3.7-max', 'moonshotai/kimi-k2.6'],
  },
  { id: 'zai', name: 'Z.ai GLM', region: 'en', baseURL: 'https://api.z.ai/api/paas/v4', keyUrl: 'https://z.ai', recommend: ['glm-4.5-flash', 'glm-5'] },
  { id: 'zhipu', name: '智谱 GLM', region: 'zh', baseURL: 'https://open.bigmodel.cn/api/paas/v4', keyUrl: 'https://open.bigmodel.cn', recommend: ['glm-4.5-flash', 'glm-4v-flash', 'glm-5'] },
  // GLM Coding Plan: the subscription issues keys against a DEDICATED
  // endpoint (/api/coding/paas/v4) — NOT interchangeable with the metered
  // /api/paas/v4 above. Region twins mirror the zhipu/zai pair.
  { id: 'glm-coding', name: 'GLM Coding 订阅', region: 'zh', baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4', keyUrl: 'https://open.bigmodel.cn/glm-coding', recommend: ['glm-5'] },
  { id: 'glm-coding-intl', name: 'GLM Coding plan', region: 'en', baseURL: 'https://api.z.ai/api/coding/paas/v4', keyUrl: 'https://z.ai', recommend: ['glm-5'] },
  // Kimi Code membership: the subscription issues real API keys (console,
  // up to 5) against an OpenAI-compatible endpoint — usage draws from the
  // plan's weekly quota, not a metered bill. Same URL both regions; the
  // twin only localizes the display name.
  { id: 'kimi-code', name: 'Kimi Code 订阅', region: 'zh', baseURL: 'https://api.kimi.com/coding/v1', keyUrl: 'https://www.kimi.com/code/console', recommend: ['k3-256k', 'kimi-for-coding'] },
  { id: 'kimi-code-intl', name: 'Kimi Code plan', region: 'en', baseURL: 'https://api.kimi.com/coding/v1', keyUrl: 'https://www.kimi.com/code/console', recommend: ['k3-256k', 'kimi-for-coding'] },
  // MiniMax: OpenAI-compatible but publishes no /models route — the preset
  // carries the catalog. Coding-plan keys and metered keys use the same
  // endpoint. Region twins mirror the intl/cn host split.
  { id: 'minimax-intl', name: 'MiniMax', region: 'en', baseURL: 'https://api.minimax.io/v1', keyUrl: 'https://platform.minimax.io', fixedModels: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'], recommend: ['MiniMax-M2.7'] },
  { id: 'minimax', name: 'MiniMax', region: 'zh', baseURL: 'https://api.minimaxi.com/v1', keyUrl: 'https://platform.minimaxi.com', fixedModels: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5'], recommend: ['MiniMax-M2.7'] },
  { id: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  // Google AI Studio: keys are free without a card, but the free tier
  // meters requests per minute tightly (and the takeaway judge doubles our
  // calls) — kept as an option near the back, not a headline path.
  { id: 'google', name: 'Google AI Studio', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', recommend: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  { id: 'moonshot-intl', name: 'Kimi', region: 'en', baseURL: 'https://api.moonshot.ai/v1', keyUrl: 'https://platform.moonshot.ai/console/api-keys' },
  { id: 'moonshot', name: 'Kimi', region: 'zh', baseURL: 'https://api.moonshot.cn/v1', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1', noKey: true },
  // ChatGPT plan via the openai-oauth local bridge (no CORS on the bridge,
  // so requests must ride the local Node proxy — hosted deployments cannot
  // reach a user's 127.0.0.1 anyway; the hint spells this out).
  { id: 'chatgpt-bridge', name: 'ChatGPT 订阅', region: 'zh', baseURL: 'http://127.0.0.1:10531/v1', noKey: true, hintKey: 'provider.chatgptBridgeHint' },
  { id: 'chatgpt-bridge-intl', name: 'ChatGPT plan', region: 'en', baseURL: 'http://127.0.0.1:10531/v1', noKey: true, hintKey: 'provider.chatgptBridgeHint' },
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
      models: (models.length > 0 ? models : PROVIDER_PRESETS.find((p) => p.id === 'openrouter')!.recommend!).map((id) => ({ id })),
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

/** The stored (user-side) vision state of a model: true/false when declared
 *  by metadata, hint or hand, undefined when nobody knows. The merged
 *  catalog cannot answer this — the proxy registers unknown as true. */
export function storedVision(modelId: string): boolean | undefined {
  for (const p of storedProviders()) {
    const m = p.models.find((x) => x.id === modelId);
    if (m) return m.vision;
  }
  return undefined;
}

/** Lazy capability learning: the first real image request IS the probe, and
 *  its verdict is written back here. Returns true when a stored model
 *  actually changed. */
export function learnVision(modelId: string, vision: boolean): boolean {
  const providers = storedProviders();
  let hit = false;
  for (const p of providers) {
    const m = p.models.find((x) => x.id === modelId);
    if (m && m.vision !== vision) {
      m.vision = vision;
      hit = true;
    }
  }
  if (hit) saveProviders(providers);
  return hit;
}

/** Register the full provider set on the proxy; returns the refreshed model list. */
export async function pushProviders(providers: RuntimeProvider[]): Promise<ModelData> {
  // read the AnySearch key straight from storage (no ui-store import — this
  // module sits below the store): the hosted worker lights the engine up
  // in its capability report when a key rides along.
  const anysearchKey = localStorage.getItem('thoughtdag.anysearchKey') || undefined;
  const res = await fetch(`${API_BASE}/api/runtime-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers, ...(anysearchKey ? { anysearchKey } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errorText(err, `HTTP ${res.status}`));
  }
  const d = await res.json();
  return { models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities };
}

// Vision families recognizable from the id alone. Only OpenRouter's /models
// route ships modality metadata; every other provider answers with bare ids,
// which used to bury real vision models (a directly-connected glm-4v-flash
// carried no badge and the Recognize button never appeared). The hint only
// ever ADDS vision — metadata, when present, always wins, and unknown stays
// unknown rather than false.
const VISION_ID_HINT = /gemini|gpt-4o|gpt-4\.1|gpt-5|claude|glm-4v|qwen[\w.-]*-vl|qvq|llava|pixtral|minicpm-v|internvl|kimi-latest|-vision|vision-/i;

/** The id-only vision guess, for models added outside a probe (recommended
 *  ids a provider's /models route forgot to list). Same contract as the
 *  hint: true or unknown, never false. */
export function guessVision(id: string): true | undefined {
  return VISION_ID_HINT.test(id) ? true : undefined;
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
    throw new Error(errorText(err, `HTTP ${res.status}`));
  }
  const models = ((await res.json()).models ?? []) as RuntimeModel[];
  for (const m of models) {
    if (m.vision === undefined && VISION_ID_HINT.test(m.id)) m.vision = true;
  }
  return models;
}

/** A window the model's own id promises (k3-256k, moonshot-v1-128k…).
    Tiny matches don't count — version fragments never name real windows. */
export function idWindowHint(modelId: string): number | undefined {
  const m = /(\d+)([km])\b/i.exec(modelId.split('/').pop() ?? '');
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2].toLowerCase() === 'm' ? 1024 * 1024 : 1024);
  return n >= 8192 ? n : undefined;
}

/** The probed context window of a browser-configured model, if known.
    Server-env models aren't stored here and return undefined (no check).
    Endpoints sometimes under-report their metadata (seen on plan-gated
    coding endpoints): a window the id itself names is the vendor's own
    promise and wins upward, never downward. */
export function contextLengthFor(modelId: string): number | undefined {
  for (const p of storedProviders()) {
    const m = p.models.find((x) => x.id === modelId);
    if (m?.contextLength) {
      const hint = idWindowHint(modelId);
      return hint && hint > m.contextLength ? hint : m.contextLength;
    }
  }
  return undefined;
}

/** Re-probe every stored provider: picked models kept, metadata updated,
    delisted ids dropped; small catalogs adopt new models automatically. */
export async function refreshStoredProviders(): Promise<ModelData | null> {
  const stored = storedProviders();
  if (stored.length === 0) return null;
  const next: RuntimeProvider[] = [];
  for (const p of stored) {
    // fixed-catalog endpoints have nothing to probe: keep the entry as-is
    if (PROVIDER_PRESETS.find((x) => x.baseURL === p.baseURL)?.fixedModels) { next.push(p); continue; }
    try {
      const fresh = await probeModels(p.baseURL, p.apiKey);
      const had = new Map(p.models.map((m) => [m.id, m]));
      const rec = new Set(PROVIDER_PRESETS.find((x) => x.baseURL === p.baseURL)?.recommend ?? []);
      const small = fresh.length <= 40;
      const models = fresh
        .filter((m) => had.has(m.id) || rec.has(m.id) || small)
        .map((m) => {
          const cl = m.contextLength ?? had.get(m.id)?.contextLength;
          return { id: m.id, ...(m.vision !== undefined ? { vision: m.vision } : had.get(m.id)?.vision ? { vision: true } : {}), ...(cl ? { contextLength: cl } : {}) };
        });
      next.push(models.length > 0 ? { ...p, models } : p);
    } catch { next.push(p); } // unreachable endpoint: keep the stored entry
  }
  const data = await pushProviders(next);
  saveProviders(next);
  return data;
}
