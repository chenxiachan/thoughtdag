import { create } from 'zustand';

// Transient UI state (toasts, confirm dialog) — deliberately separate from
// the main store: no persistence, no undo history, and the imperative API
// below works from non-React modules (e.g. store/streaming.ts).

export interface ToastItem {
  id: string;
  kind: 'error' | 'success' | 'info';
  message: string;
  /** Optional one-shot action button (e.g. "make full" on a fresh reference). */
  action?: { label: string; run: () => void };
}

interface ConfirmRequest {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

const WEB_SEARCH_KEY = 'thoughtdag.webSearch';
const SCHOLAR_SEARCH_KEY = 'thoughtdag.scholarSearch';
const RECALL_KEY = 'thoughtdag.recall';
const JUDGE_KEY = 'thoughtdag.judge';
const MODEL_KEY = 'thoughtdag.model';
const EFFORT_KEY = 'thoughtdag.agentEffort';
/** The effort level for the next agent turn, in that runtime's own words; '' = the runtime's own default. */
export type AgentEffort = string;
const MCP_KEY = 'thoughtdag.mcpTools';
const AUTO_PAUSE_KEY = 'thoughtdag.autoRefreshPaused';
const HIDE_ANNOTATIONS_KEY = 'thoughtdag.hideAnnotations';
/** 'on' = the wheel (and a trackpad's two-finger scroll) pans the canvas; off, the default, it zooms as it did through 0.5.2 */
const WHEEL_PANS_KEY = 'thoughtdag.wheelPans';

export interface LadderJob { total: number; done: number; failed: number; skipped: number; model: string; running: boolean; cancelled: boolean; finishedAt?: number; /** the last transport error, shown when something did not succeed */ lastError?: string }

interface UiState {
  toasts: ToastItem[];
  confirmRequest: ConfirmRequest | null;
  tutorialOpen: boolean;
  /** Global switches: expose tool groups to the model (it still decides when to use them). */
  webSearchEnabled: boolean;
  /** recall past conversations and memories into a new ask (the why layer); off by default, per-node snapshot like the search switches */
  recallEnabled: boolean;
  /** the model that selects zoom ladders: 'answering' = the model that wrote the answer (agents fall back to the default), or a model id */
  ladderModel: string;
  setLadderModel: (id: string) => void;
  /** the summary update running now (selection toolbar / right-click), for the bottom-right card */
  ladderJob: LadderJob | null;
  setLadderJob: (job: LadderJob | null | ((j: LadderJob | null) => LadderJob | null)) => void;
  /** how much recall may bring in: a share of the answering model's window (input tokens), lean / standard / generous */
  recallScale: 'lean' | 'standard' | 'generous';
  setRecallScale: (s: 'lean' | 'standard' | 'generous') => void;
  /** how far a judged recall reaches: 40 hits read in full, 2,000 hits by their heads, or every turn */
  recallReach: 'light' | 'deep' | 'full';
  setRecallReach: (r: 'light' | 'deep' | 'full') => void;
  /** the composer's recall menu: what the next ask uses instead of the defaults; the ask spends it */
  recallOverride: { enabled?: boolean; reach?: 'light' | 'deep' | 'full'; scale?: 'lean' | 'standard' | 'generous' } | null;
  setRecallOverride: (o: { enabled?: boolean; reach?: 'light' | 'deep' | 'full'; scale?: 'lean' | 'standard' | 'generous' } | null) => void;
  /** how many items one recall brings in, and the token budget they share */
  /** the judge (a System One decision endpoint) recall and other judgements may ask */
  judge: import('./judge').JudgeSettings;
  scholarSearchEnabled: boolean;
  mcpEnabled: boolean;
  autoRefreshPaused: boolean;
  /** View mode: hide frames + unlinked content nodes (annotation layer off). */
  annotationsHidden: boolean;
  /** Canvas wheel: false (default) zooms, true pans (trackpad style; zoom by pinch or ⌘/Ctrl + wheel). */
  wheelPans: boolean;
  /** Panel mode: opened by double-clicking a node, closed via its X. While
   *  on, the panel follows the selection; single clicks only select. */
  panelOpen: boolean;
  /** Half-typed inputs keyed by surface (e.g. follow:<nodeId>) — survive
      node/panel switches within the session, cleared on submit. */
  drafts: Record<string, string>;
  /** Live overlay-panel width: the toolbar offsets itself by it so nothing
      hides underneath the panel. */
  panelWidth: number;
  /** Material node currently open in the reading overlay (session only). */
  readerNodeId: string | null;
  /** One-shot landing spot for the reader: scroll to this page and open this
      thread on mount (set by canvas p.N chips, consumed by the overlay). */
  readerJump: { page?: number; threadId?: string } | null;
  /** Selected LLM id; null = server default. */
  selectedModel: string | null;
  agentEffort: AgentEffort;
  dismissToast: (id: string) => void;
  resolveConfirm: (ok: boolean) => void;
  setTutorialOpen: (open: boolean) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setRecallEnabled: (enabled: boolean) => void;
  setJudge: (patch: Partial<import('./judge').JudgeSettings>) => void;
  setScholarSearchEnabled: (enabled: boolean) => void;
  setMcpEnabled: (enabled: boolean) => void;
  setAutoRefreshPaused: (paused: boolean) => void;
  setAnnotationsHidden: (hidden: boolean) => void;
  setWheelPans: (pans: boolean) => void;
  setDraft: (key: string, text: string) => void;
  setPanelWidth: (w: number) => void;
  /** User-editable role option library (persisted). */
  roleLib: import('./role-templates').RoleLib;
  setRoleLib: (lib: import('./role-templates').RoleLib) => void;
  roleManagerOpen: boolean;
  setRoleManagerOpen: (open: boolean) => void;
  /** Image reading / Recognize model: 'auto' = strongest first (persisted). */
  visionModelPref: string;
  setVisionModelPref: (id: string) => void;
  /** Web search engine: 'server' = follow the proxy's .env default. */
  searchEnginePref: string;
  setSearchEnginePref: (id: string) => void;
  /** Optional AnySearch key: lifts the anonymous per-IP quota locally and
      is REQUIRED for the engine on the hosted app. Stateless like model keys. */
  anysearchKey: string;
  setAnysearchKey: (key: string) => void;
  /** Ambient long-term memory: ON by default, one switch, visible writes. */
  memoryEnabled: boolean;
  setMemoryEnabled: (on: boolean) => void;
  memories: import('./memory').MemoryEntry[];
  setMemories: (entries: import('./memory').MemoryEntry[]) => void;
  /** the person's memory as two documents (preferences, identity); the fragment list above only survives until it is folded in */
  profile: import('./profile').Profile;
  setProfile: (p: import('./profile').Profile) => void;
  /** project facts no topic claimed, waiting to be filed */
  memoryInbox: import('./profile').InboxItem[];
  setMemoryInbox: (items: import('./profile').InboxItem[]) => void;
  memoryManagerOpen: boolean;
  releaseNotesOpen: boolean;
  setReleaseNotesOpen: (open: boolean) => void;
  /** inside the harness: a newer plugin on the registry than the one running */
  pluginUpdate: { current: string; latest: string } | null;
  setPluginUpdate: (u: { current: string; latest: string } | null) => void;
  /** inside the harness: whether the host shows its title band over the map (its own 对话|思维图 switch), whether it keeps the floating pill for both views (then the canvas hides its own twin), and whether it is the desktop app */
  harnessHost: { bar: boolean; desktop: boolean; pill: boolean } | null;
  setHarnessHost: (h: { bar: boolean; desktop: boolean; pill: boolean } | null) => void;
  highlightsOverviewOpen: boolean;
  setHighlightsOverviewOpen: (open: boolean) => void;
  materialsOverviewOpen: boolean;
  setMaterialsOverviewOpen: (open: boolean) => void;
  timelineOverviewOpen: boolean;
  setTimelineOverviewOpen: (open: boolean) => void;
  setMemoryManagerOpen: (open: boolean) => void;
  /** Browser-side API key dialog (the .env-free path in). */
  apiKeyModalOpen: boolean;
  /** which part the dialog opens on: the interfaces (default), or the judge alone (from the picker's judge row and the memory page) */
  apiKeyModalSection: 'providers' | 'judge';
  setApiKeyModalOpen: (open: boolean, section?: 'providers' | 'judge') => void;
  /** Monotonic signal: each bump asks the global model picker to drop open
      (the "look, your models are here" moment after a connect succeeds). */
  modelPickerPing: number;
  pingModelPicker: () => void;
  /** Canvas search filter: the hit set while a search is live (null = no
      active search). Nodes NOT in the set dim out — the searchlight. */
  searchHitIds: Set<string> | null;
  setSearchHitIds: (ids: Set<string> | null) => void;
  /** Node whose answer is open in the large reading overlay. */
  responseViewerNodeId: string | null;
  setResponseViewerNodeId: (id: string | null) => void;
  /** Auto-backup folder name (null = off) — display only, handle lives in idb. */
  autoBackupDir: string | null;
  setAutoBackupDir: (name: string | null) => void;
  lastAutoBackupAt: number | null;
  setLastAutoBackupAt: (t: number | null) => void;
  backupDialogOpen: boolean;
  setBackupDialogOpen: (v: boolean) => void;
  /** One-shot arrival viewport: after an import lands, the canvas centers
      on this node (the working tail) instead of fitting 200 turns into one
      unreadable column. Consumed by the canvas on init. */
  arrivalFocusNodeId: string | null;
  setArrivalFocusNodeId: (id: string | null) => void;
  condenseDialogOpen: boolean;
  setCondenseDialogOpen: (v: boolean) => void;
  condenseHighlightIds: string[];
  setCondenseHighlightIds: (ids: string[]) => void;
  /** The background condense build: survives closing the window. Editing
      actions hold still while it runs (guards in the store slices). */
  condenseRun: {
    status: 'idle' | 'building' | 'done' | 'error';
    current: number; total: number; streaming: string;
    error?: string;
    originalIds: string[];
    distillIds: string[];
  };
  setCondenseRun: (patch: Partial<UiState['condenseRun']>) => void;
  /** Paradigms and other lab features live behind this switch. */
  advancedMode: boolean;
  setAdvancedMode: (v: boolean) => void;
  /** Preset the ApiKeyModal should open onto (landing quick-connect). */
  apiKeyPresetHint: string | null;
  setApiKeyPresetHint: (id: string | null) => void;
  /** A freshly OAuth-minted OpenRouter key awaiting the user's model
      confirmation in the ApiKeyModal (consumed on pickup, never stored). */
  oauthMintedKey: string | null;
  setOauthMintedKey: (key: string | null) => void;
  /** Node pulsing a beacon ripple (hovering "continue last thread"). */
  beaconNodeId: string | null;
  setBeaconNodeId: (id: string | null) => void;
  /** Share dialog: the freshly built read-only link (null = closed). */
  shareDialogUrl: string | null;
  setShareDialogUrl: (url: string | null) => void;
  /** Thought-map export console (structure-only share image). */
  thoughtMapOpen: boolean;
  setThoughtMapOpen: (v: boolean) => void;
  /** Viewer boot failed to decode the #view= hash (truncated link). */
  viewerLoadError: boolean;
  setViewerLoadError: (v: boolean) => void;
  setReaderNodeId: (id: string | null, jump?: { page?: number; threadId?: string }) => void;
  setPanelOpen: (open: boolean) => void;
  setSelectedModel: (model: string | null) => void;
  setAgentEffort: (level: AgentEffort) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  tutorialOpen: false,
  // the three per-ask permissions (web, scholar, recall) start off: an ask sends nothing anywhere but the model until the person opens a door
  webSearchEnabled: localStorage.getItem(WEB_SEARCH_KEY) === 'on',
  recallEnabled: localStorage.getItem(RECALL_KEY) === 'on',
  ladderModel: localStorage.getItem('thoughtdag.ladderModel') || 'answering',
  setLadderModel: (id) => { localStorage.setItem('thoughtdag.ladderModel', id); set({ ladderModel: id }); },
  ladderJob: null,
  setLadderJob: (job) => set((st) => ({ ladderJob: typeof job === 'function' ? job(st.ladderJob) : job })),
  recallScale: ((): 'lean' | 'standard' | 'generous' => { const v = localStorage.getItem('thoughtdag.recallScale'); return v === 'lean' || v === 'generous' ? v : 'standard'; })(),
  setRecallScale: (s) => { localStorage.setItem('thoughtdag.recallScale', s); set({ recallScale: s }); },
  recallReach: ((): 'light' | 'deep' | 'full' => { const v = localStorage.getItem('thoughtdag.recallReach'); return v === 'deep' || v === 'full' ? v : 'light'; })(),
  setRecallReach: (r) => { localStorage.setItem('thoughtdag.recallReach', r); set({ recallReach: r }); },
  recallOverride: null,
  setRecallOverride: (o) => set((s) => ({ recallOverride: o === null ? null : { ...(s.recallOverride ?? {}), ...o } })),
  judge: (() => {
    const base = { enabled: true, provider: 'none' as const, openrouterKey: '', typesafeKey: '', cloudflareAccount: '', cloudflareToken: '', customUrl: '', customKey: '' };
    let j: import('./judge').JudgeSettings = base;
    try { const raw = localStorage.getItem(JUDGE_KEY); if (raw) j = { ...base, ...JSON.parse(raw) }; } catch { /* the defaults */ }
    // the on/off switch became the provider dropdown's "off" entry: a judge switched off before stays off
    if (j.enabled === false) j = { ...j, enabled: true, provider: 'off' };
    return j;
  })(),
  scholarSearchEnabled: localStorage.getItem(SCHOLAR_SEARCH_KEY) === 'on',
  // MCP is parked until the personalization system is designed (external
  // knowledge needs its own provenance surface first) — hidden AND off.
  mcpEnabled: localStorage.getItem(MCP_KEY) === 'on',
  autoRefreshPaused: localStorage.getItem(AUTO_PAUSE_KEY) === 'yes',
  annotationsHidden: localStorage.getItem(HIDE_ANNOTATIONS_KEY) === 'yes',
  wheelPans: localStorage.getItem(WHEEL_PANS_KEY) === 'on',
  panelOpen: false,
  panelWidth: (() => { const raw = localStorage.getItem('thoughtdag.panelWidth'); const n = raw ? parseInt(raw, 10) : NaN; return Number.isFinite(n) ? n : 520; })(),
  selectedModel: localStorage.getItem(MODEL_KEY) || null,
  agentEffort: localStorage.getItem(EFFORT_KEY) || '',
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  resolveConfirm: (ok) => {
    get().confirmRequest?.resolve(ok);
    set({ confirmRequest: null });
  },
  setTutorialOpen: (open) => {
    if (!open) localStorage.setItem('thoughtdag.tutorialDone', '1');
    set({ tutorialOpen: open });
  },
  setJudge: (patch) => set((s) => { const judge = { ...s.judge, ...patch }; localStorage.setItem(JUDGE_KEY, JSON.stringify(judge)); return { judge }; }),
  setRecallEnabled: (enabled) => {
    localStorage.setItem(RECALL_KEY, enabled ? 'on' : 'off');
    set({ recallEnabled: enabled });
  },
  setWebSearchEnabled: (enabled) => {
    localStorage.setItem(WEB_SEARCH_KEY, enabled ? 'on' : 'off');
    set({ webSearchEnabled: enabled });
  },
  setScholarSearchEnabled: (enabled) => {
    localStorage.setItem(SCHOLAR_SEARCH_KEY, enabled ? 'on' : 'off');
    set({ scholarSearchEnabled: enabled });
  },
  setMcpEnabled: (enabled) => {
    localStorage.setItem(MCP_KEY, enabled ? 'on' : 'off');
    set({ mcpEnabled: enabled });
  },
  setPanelOpen: (open) => set({ panelOpen: open }),
  setPanelWidth: (w) => set({ panelWidth: w }),
  roleLib: (() => {
    try {
      const raw = localStorage.getItem('thoughtdag.roleLib');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.custom) && Array.isArray(parsed.hidden)) return parsed;
    } catch { /* fall through to empty */ }
    return { custom: [], hidden: [] };
  })(),
  setRoleLib: (lib) => {
    localStorage.setItem('thoughtdag.roleLib', JSON.stringify(lib));
    set({ roleLib: lib });
  },
  roleManagerOpen: false,
  setRoleManagerOpen: (open) => set({ roleManagerOpen: open }),
  visionModelPref: localStorage.getItem('thoughtdag.visionModel') || 'auto',
  setVisionModelPref: (id) => {
    localStorage.setItem('thoughtdag.visionModel', id);
    set({ visionModelPref: id });
  },
  searchEnginePref: localStorage.getItem('thoughtdag.searchEngine') || 'server',
  setSearchEnginePref: (id) => {
    localStorage.setItem('thoughtdag.searchEngine', id);
    set({ searchEnginePref: id });
  },
  anysearchKey: localStorage.getItem('thoughtdag.anysearchKey') || '',
  setAnysearchKey: (key) => {
    if (key) localStorage.setItem('thoughtdag.anysearchKey', key);
    else localStorage.removeItem('thoughtdag.anysearchKey');
    set({ anysearchKey: key });
  },
  memoryEnabled: localStorage.getItem('thoughtdag.memoryEnabled') !== 'off',
  setMemoryEnabled: (on) => {
    localStorage.setItem('thoughtdag.memoryEnabled', on ? 'on' : 'off');
    set({ memoryEnabled: on });
  },
  memories: (() => {
    try {
      const raw = localStorage.getItem('thoughtdag.memory');
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fresh start */ }
    return [];
  })(),
  setMemories: (entries) => {
    localStorage.setItem('thoughtdag.memory', JSON.stringify(entries));
    set({ memories: entries });
  },
  profile: (() => {
    const empty = { preferences: { text: '', updatedAt: null, changelog: [] }, identity: { text: '', updatedAt: null, changelog: [] } };
    try { const raw = localStorage.getItem('thoughtdag.profile'); const p = raw ? JSON.parse(raw) : null; return p && typeof p === 'object' ? { ...empty, ...p } : empty; } catch { return empty; }
  })(),
  setProfile: (p) => { localStorage.setItem('thoughtdag.profile', JSON.stringify(p)); set({ profile: p }); },
  memoryInbox: (() => { try { const raw = localStorage.getItem('thoughtdag.memoryInbox'); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) ? v : []; } catch { return []; } })(),
  setMemoryInbox: (items) => { localStorage.setItem('thoughtdag.memoryInbox', JSON.stringify(items)); set({ memoryInbox: items }); },
  memoryManagerOpen: false,
  highlightsOverviewOpen: false,
  setHighlightsOverviewOpen: (open) => set({ highlightsOverviewOpen: open }),
  materialsOverviewOpen: false,
  setMaterialsOverviewOpen: (open) => set({ materialsOverviewOpen: open }),
  timelineOverviewOpen: false,
  setTimelineOverviewOpen: (open) => set({ timelineOverviewOpen: open }),
  setMemoryManagerOpen: (open) => set({ memoryManagerOpen: open }),
  releaseNotesOpen: false,
  setReleaseNotesOpen: (open) => set({ releaseNotesOpen: open }),
  pluginUpdate: null,
  setPluginUpdate: (u) => set({ pluginUpdate: u }),
  harnessHost: null,
  setHarnessHost: (h) => set({ harnessHost: h }),
  apiKeyModalOpen: false,
  apiKeyModalSection: 'providers',
  setApiKeyModalOpen: (open, section) => set({ apiKeyModalOpen: open, apiKeyModalSection: open ? (section ?? 'providers') : 'providers' }),
  modelPickerPing: 0,
  searchHitIds: null,
  setSearchHitIds: (ids) => set({ searchHitIds: ids }),
  pingModelPicker: () => set((s) => ({ modelPickerPing: s.modelPickerPing + 1 })),
  responseViewerNodeId: null,
  setResponseViewerNodeId: (id) => set({ responseViewerNodeId: id }),
  autoBackupDir: null,
  setAutoBackupDir: (name) => set({ autoBackupDir: name }),
  lastAutoBackupAt: null,
  setLastAutoBackupAt: (t) => set({ lastAutoBackupAt: t }),
  backupDialogOpen: false,
  arrivalFocusNodeId: null,
  setArrivalFocusNodeId: (id) => set({ arrivalFocusNodeId: id }),
  condenseDialogOpen: false,
  setCondenseDialogOpen: (v) => set({ condenseDialogOpen: v, ...(v ? {} : { condenseHighlightIds: [] }) }),
  condenseHighlightIds: [],
  setCondenseHighlightIds: (ids) => set({ condenseHighlightIds: ids }),
  condenseRun: { status: 'idle', current: 0, total: 0, streaming: '', originalIds: [], distillIds: [] },
  setCondenseRun: (patch) => set((s) => ({ condenseRun: { ...s.condenseRun, ...patch } })),
  advancedMode: localStorage.getItem('thoughtdag.advanced') === '1',
  setAdvancedMode: (v) => { localStorage.setItem('thoughtdag.advanced', v ? '1' : '0'); set({ advancedMode: v }); },
  apiKeyPresetHint: null,
  setApiKeyPresetHint: (id) => set({ apiKeyPresetHint: id }),
  oauthMintedKey: null,
  setOauthMintedKey: (key) => set({ oauthMintedKey: key }),
  beaconNodeId: null,
  setBeaconNodeId: (id) => set({ beaconNodeId: id }),
  setBackupDialogOpen: (v) => set({ backupDialogOpen: v }),
  shareDialogUrl: null,
  setShareDialogUrl: (url) => set({ shareDialogUrl: url }),
  thoughtMapOpen: false,
  setThoughtMapOpen: (v) => set({ thoughtMapOpen: v }),
  viewerLoadError: false,
  setViewerLoadError: (v) => set({ viewerLoadError: v }),
  readerNodeId: null,
  readerJump: null,
  setReaderNodeId: (id, jump) => set({ readerNodeId: id, readerJump: id ? (jump ?? null) : null }),
  drafts: {},
  setDraft: (key, text) => set((s) => {
    if (!text) {
      if (!(key in s.drafts)) return s;
      const next = { ...s.drafts };
      delete next[key];
      return { drafts: next };
    }
    return { drafts: { ...s.drafts, [key]: text } };
  }),
  setAnnotationsHidden: (hidden) => {
    localStorage.setItem(HIDE_ANNOTATIONS_KEY, hidden ? 'yes' : 'no');
    set({ annotationsHidden: hidden });
  },
  setWheelPans: (pans) => {
    try { localStorage.setItem(WHEEL_PANS_KEY, pans ? 'on' : 'off'); } catch { /* the choice still holds for this session */ }
    set({ wheelPans: pans });
  },
  setAutoRefreshPaused: (paused) => {
    localStorage.setItem(AUTO_PAUSE_KEY, paused ? 'yes' : 'no');
    set({ autoRefreshPaused: paused });
  },
  setSelectedModel: (model) => {
    if (model) localStorage.setItem(MODEL_KEY, model);
    else localStorage.removeItem(MODEL_KEY);
    set({ selectedModel: model });
  },
  setAgentEffort: (level) => {
    if (level) localStorage.setItem(EFFORT_KEY, level);
    else localStorage.removeItem(EFFORT_KEY);
    set({ agentEffort: level });
  },
}));

// Debug: expose the UI store for screenshot/e2e scripts (DEV only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, { __ui: useUiStore });
}

let toastCounter = 0;

/** Show a toast (bottom-right). duration 0 = sticky until dismissed.
    Returns the toast id (dismissToast / updateToast to manage sticky ones). */
export function toast(kind: ToastItem['kind'], message: string, duration = 5000, action?: ToastItem['action']): string {
  const id = `toast-${++toastCounter}`;
  useUiStore.setState((s) => ({ toasts: [...s.toasts, { id, kind, message, action }] }));
  if (duration > 0) {
    setTimeout(() => useUiStore.getState().dismissToast(id), duration);
  }
  return id;
}

/** Update a sticky toast's message in place (e.g. replay progress). */
export function updateToast(id: string, message: string) {
  useUiStore.setState((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, message } : t)) }));
}

/** Promise-style in-app replacement for window.confirm(). */
export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    // A newer request supersedes an unresolved one.
    useUiStore.getState().confirmRequest?.resolve(false);
    useUiStore.setState({ confirmRequest: { ...opts, resolve } });
  });
}

// DEV hook for e2e: a bare-path dynamic import of this module forks a
// second instance once HMR has stamped the page's copy with ?t= —
// setPanelOpen on the orphan does nothing. Tests must use window.__ui.
if (import.meta.env.DEV) {
  Object.assign(window, { __ui: useUiStore });
}

/** The recall settings an ask starts with: the composer menu's one-ask override where set, else the
 *  defaults (the judge page's). The ask spends the override, so the next ask is back on the defaults. */
export function recallSnapshot(): { recall: boolean; recallReach: 'light' | 'deep' | 'full'; recallScale: 'lean' | 'standard' | 'generous' } {
  const s = useUiStore.getState();
  const o = s.recallOverride;
  if (o) useUiStore.setState({ recallOverride: null });
  return { recall: o?.enabled ?? s.recallEnabled, recallReach: o?.reach ?? s.recallReach, recallScale: o?.scale ?? s.recallScale };
}
