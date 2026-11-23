import { useEffect, useState } from 'react';
import { API_BASE } from './constants';
import { storedProviders, pushProviders } from './runtime-providers';
import { agentCatalog, AGENT_PROVIDER, AGENT_RUNTIMES, agentTarget, isAgentModel, type RuntimeStatus } from './agents/agent-runtime';
import type { AgentRuntime } from '../types';
import { t, fmt } from '../i18n';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  /** agent models: the provider the runtime serves this model through, set when the runtime lists more than one */
  vendor?: string;
  vision: boolean;
  /** agent models: the effort levels this runtime accepts for the model, in its own words (read from the CLI) */
  efforts?: string[];
  /** the runtime's own default among them, when it says */
  defaultEffort?: string | null;
}

export interface Capabilities {
  webSearch: boolean;
  searchEngine: string;
  /** AnySearch engine reachable (always true locally; hosted = key present). */
  anysearch?: boolean;
  /** DeepSeek's Search API can serve as the engine (a DeepSeek key is configured). */
  deepseekSearch?: boolean;
  scholarSearch: boolean;
  vision: boolean;
}

export type ModelData = { models: ModelInfo[]; default: string | null; capabilities?: Capabilities; /** the agent runtimes are being asked right now */ agentsPending?: boolean; /** what each agent runtime answered the last time it was asked (absent until asked) */ runtimes?: Partial<Record<AgentRuntime, RuntimeStatus>> };

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
    let base: ModelData | null = null;
    if (stored.length > 0) {
      try { base = await pushProviders(stored); } catch { /* proxy down or bad config: fall through to the plain list */ }
    }
    if (!base) {
      base = await fetch(`${API_BASE}/api/models`)
        .then((r) => r.json())
        .then((d) => ({ models: d.models ?? [], default: d.default ?? null, capabilities: d.capabilities }) as ModelData)
        .catch(() => null);
    }
    if (!base) return null;
    // The API models show at once. The agent runtimes are NOT asked at
    // launch: asking means starting their CLIs (a catalog process, an app
    // server — seconds and a hundred megabytes each), which a launch that
    // never touches an agent should not pay. Last launch's agent list stands
    // in; the runtimes are asked the first time a picker opens (ensureAgentsFresh).
    cache = withRemembered(base);
    return cache;
  })();
  return inflight;
}

/** Family-level id for cross-provider comparison: the gateway slug
    'deepseek/deepseek-v4-pro' and the direct id 'deepseek-v4-pro' are the
    same model reached through different doors. */
function modelBasename(id: string): string {
  return (id.split('/').pop() ?? id).toLowerCase();
}

/** Ids a provider retired and now serves through a successor (DeepSeek's
    V4 Flash names since 2026-09-10): a pin on one follows the successor. */
const RETIRED_MODEL_IDS: Record<string, string> = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
};

/** Reconcile a pinned model id against the locally available list: exact id
    → itself; same family under a different provider → the local id; a
    retired id → its successor; otherwise null (not reachable here). */
export function reconcileModelId(pinned: string, models: ModelInfo[]): string | null {
  if (models.some((m) => m.id === pinned)) return pinned;
  const base = modelBasename(pinned);
  const successor = RETIRED_MODEL_IDS[base];
  const match = models.find((m) => modelBasename(m.id) === base)
    ?? (successor ? models.find((m) => modelBasename(m.id) === successor) : undefined);
  return match ? match.id : null;
}

const AGENT_CACHE_KEY = 'thoughtdag.agentModels';
const AGENT_NAMES_KEY = 'thoughtdag.agentModelNames';
const hasAgentsBridge = () => typeof window !== 'undefined' && !!window.desktopAgents;
/** The agent entries the runtimes bridge owns and may replace: the ones it
 *  reported itself (pi/ codex/ claude/ ids). A server can hand out agent
 *  entries of its own under the same group (the harness runs the agent loop
 *  on its models); those belong with the API list and are never replaced. */
const isRuntimeAgent = (m: ModelInfo) => m.provider === AGENT_PROVIDER && isAgentModel(m.id);

/** Picker id → the model name the runtime actually ran under it (an alias
 *  like `opus` resolves inside the CLI; the first turn tells us to what). */
function resolvedNames(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(AGENT_NAMES_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** An alias entry shows the model it resolved to, once a turn has told us —
 *  marked as the LAST run's, since an alias means "the newest" and the CLI may
 *  have moved on since (the next turn reports the new name and the label follows). */
function withResolvedNames(models: ModelInfo[]): ModelInfo[] {
  const names = resolvedNames();
  return models.map((m) => {
    const r = m.provider === AGENT_PROVIDER ? names[m.id] : undefined;
    if (!r || m.id.endsWith('/' + r) || m.name.includes(r)) return m;
    return { ...m, name: `${m.name} · ${fmt(t('models.resolvedLast'), { r })}` };
  });
}

/** A model id as the record should read: an agent model in full (runtime ·
 *  model, the resolved name once known, the effort the version ran at); an
 *  API model by its bare name. Pure: reads only the local caches. */
export function describeModel(id: string | null | undefined, effort?: string | null, opts?: { /** the card form: runtime · model · effort, without the resolved name */ compact?: boolean }): string {
  if (!id) return '';
  const target = agentTarget(id);
  if (!target) return id.split('/').pop() ?? id;
  let remembered: ModelInfo[] = [];
  try { remembered = JSON.parse(localStorage.getItem(AGENT_CACHE_KEY) ?? '[]'); } catch { remembered = []; }
  const entry = remembered.find((m) => m && m.id === id);
  const base = entry?.name ?? `${AGENT_RUNTIMES[target.runtime].label} · ${target.id}`;
  const resolved = opts?.compact ? undefined : resolvedNames()[id];
  const withName = resolved && !base.includes(resolved) ? `${base} · ${resolved}` : base;
  return effort ? `${withName} · ${effort}` : withName;
}

/** Last launch's agent models, so the picker is whole without asking anyone. */
function withRemembered(d: ModelData): ModelData {
  if (!hasAgentsBridge()) return d;
  let remembered: ModelInfo[] = [];
  try { remembered = JSON.parse(localStorage.getItem(AGENT_CACHE_KEY) ?? '[]'); } catch { remembered = []; }
  const own = d.models.filter((m) => !isRuntimeAgent(m));
  return { ...d, models: [...own, ...withResolvedNames(remembered.filter((m) => m && isRuntimeAgent(m)))], agentsPending: false };
}

let agentsAsked = false;
let agentsRefreshing: Promise<void> | null = null;

/** Ask the runtimes and replace the agent group when they answer. */
async function refreshAgents(): Promise<void> {
  if (!hasAgentsBridge() || !cache) return;
  if (agentsRefreshing) return agentsRefreshing;
  agentsRefreshing = (async () => {
    const before = cache!;
    setModelsCache({ ...before, agentsPending: true });
    const asked = await agentCatalog().catch(() => ({ models: [] as ModelInfo[], runtimes: {} as Partial<Record<AgentRuntime, RuntimeStatus>> }));
    const extra = asked.models;
    try { localStorage.setItem(AGENT_CACHE_KEY, JSON.stringify(extra)); } catch { /* ignore */ }
    const own = (cache ?? before).models.filter((m) => !isRuntimeAgent(m));
    setModelsCache({ ...(cache ?? before), models: [...own, ...withResolvedNames(extra)], agentsPending: false, runtimes: asked.runtimes });
  })().finally(() => { agentsRefreshing = null; });
  return agentsRefreshing;
}

/** The first picker to open in this launch asks the runtimes for their
 *  catalogs (the spinner in the agent group covers the wait); later opens
 *  reuse the answer. Harmless when there is no agents bridge. */
/** Ask the runtimes again now (the picker's recheck after the person installed a CLI or fixed their PATH). */
export function recheckAgents(): Promise<void> {
  agentsAsked = true;
  return getModelsOnce().then(() => refreshAgents());
}

export function ensureAgentsFresh(): void {
  if (agentsAsked || !hasAgentsBridge()) return;
  agentsAsked = true;
  void getModelsOnce().then(() => refreshAgents());
}

/** A turn reported which model an agent alias resolved to: remember it
 *  and rename the entry in place, so the picker reads `Opus · claude-opus-5`. */
export function noteAgentModelName(id: string, resolved: string): void {
  if (!id || !resolved) return;
  const names = resolvedNames();
  if (names[id] === resolved) return;
  names[id] = resolved;
  try { localStorage.setItem(AGENT_NAMES_KEY, JSON.stringify(names)); } catch { /* ignore */ }
  if (!cache) return;
  const own = cache.models.filter((m) => !isRuntimeAgent(m));
  const agents = cache.models.filter(isRuntimeAgent).map((m) => ({ ...m, name: m.name.split(' · ').slice(0, 2).join(' · ') }));
  setModelsCache({ ...cache, models: [...own, ...withResolvedNames(agents)] });
}
if (typeof window !== 'undefined') {
  window.addEventListener('td:agent-model-resolved', (ev) => {
    const d = (ev as CustomEvent<{ id?: string; resolved?: string }>).detail;
    if (d?.id && d?.resolved) noteAgentModelName(d.id, d.resolved);
  });
}

/** Replace the shared cache (after a runtime-key change) and notify every subscribed picker. */
export function setModelsCache(d: ModelData): void {
  cache = d;
  inflight = Promise.resolve(d);
  for (const fn of listeners) fn(d);
  // a list rebuilt from a runtime-key change carries no agent group yet:
  // last launch's entries come back, and a fresh answer only if this
  // launch already asked (the runtimes are then alive anyway)
  if (d.agentsPending === undefined && hasAgentsBridge() && !d.models.some(isRuntimeAgent)) {
    cache = withRemembered(d);
    for (const fn of listeners) fn(cache);
    if (agentsAsked) void refreshAgents();
  }
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
