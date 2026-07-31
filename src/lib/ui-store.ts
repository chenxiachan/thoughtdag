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
const MODEL_KEY = 'thoughtdag.model';
const MCP_KEY = 'thoughtdag.mcpTools';
const AUTO_PAUSE_KEY = 'thoughtdag.autoRefreshPaused';
const HIDE_ANNOTATIONS_KEY = 'thoughtdag.hideAnnotations';

interface UiState {
  toasts: ToastItem[];
  confirmRequest: ConfirmRequest | null;
  tutorialOpen: boolean;
  /** Global switches: expose tool groups to the model (it still decides when to use them). */
  webSearchEnabled: boolean;
  scholarSearchEnabled: boolean;
  mcpEnabled: boolean;
  autoRefreshPaused: boolean;
  /** View mode: hide frames + unlinked content nodes (annotation layer off). */
  annotationsHidden: boolean;
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
  dismissToast: (id: string) => void;
  resolveConfirm: (ok: boolean) => void;
  setTutorialOpen: (open: boolean) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setScholarSearchEnabled: (enabled: boolean) => void;
  setMcpEnabled: (enabled: boolean) => void;
  setAutoRefreshPaused: (paused: boolean) => void;
  setAnnotationsHidden: (hidden: boolean) => void;
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
  /** Ambient long-term memory: ON by default, one switch, visible writes. */
  memoryEnabled: boolean;
  setMemoryEnabled: (on: boolean) => void;
  memories: import('./memory').MemoryEntry[];
  setMemories: (entries: import('./memory').MemoryEntry[]) => void;
  memoryManagerOpen: boolean;
  highlightsOverviewOpen: boolean;
  setHighlightsOverviewOpen: (open: boolean) => void;
  materialsOverviewOpen: boolean;
  setMaterialsOverviewOpen: (open: boolean) => void;
  timelineOverviewOpen: boolean;
  setTimelineOverviewOpen: (open: boolean) => void;
  setMemoryManagerOpen: (open: boolean) => void;
  /** Browser-side API key dialog (the .env-free path in). */
  apiKeyModalOpen: boolean;
  setApiKeyModalOpen: (open: boolean) => void;
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
  /** Share dialog: the freshly built read-only link (null = closed). */
  shareDialogUrl: string | null;
  setShareDialogUrl: (url: string | null) => void;
  /** Viewer boot failed to decode the #view= hash (truncated link). */
  viewerLoadError: boolean;
  setViewerLoadError: (v: boolean) => void;
  setReaderNodeId: (id: string | null, jump?: { page?: number; threadId?: string }) => void;
  setPanelOpen: (open: boolean) => void;
  setSelectedModel: (model: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  tutorialOpen: false,
  webSearchEnabled: localStorage.getItem(WEB_SEARCH_KEY) !== 'off',
  scholarSearchEnabled: localStorage.getItem(SCHOLAR_SEARCH_KEY) !== 'off',
  // MCP is parked until the personalization system is designed (external
  // knowledge needs its own provenance surface first) — hidden AND off.
  mcpEnabled: localStorage.getItem(MCP_KEY) === 'on',
  autoRefreshPaused: localStorage.getItem(AUTO_PAUSE_KEY) === 'yes',
  annotationsHidden: localStorage.getItem(HIDE_ANNOTATIONS_KEY) === 'yes',
  panelOpen: false,
  panelWidth: (() => { const raw = localStorage.getItem('thoughtdag.panelWidth'); const n = raw ? parseInt(raw, 10) : NaN; return Number.isFinite(n) ? n : 520; })(),
  selectedModel: localStorage.getItem(MODEL_KEY) || null,
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  resolveConfirm: (ok) => {
    get().confirmRequest?.resolve(ok);
    set({ confirmRequest: null });
  },
  setTutorialOpen: (open) => set({ tutorialOpen: open }),
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
  memoryManagerOpen: false,
  highlightsOverviewOpen: false,
  setHighlightsOverviewOpen: (open) => set({ highlightsOverviewOpen: open }),
  materialsOverviewOpen: false,
  setMaterialsOverviewOpen: (open) => set({ materialsOverviewOpen: open }),
  timelineOverviewOpen: false,
  setTimelineOverviewOpen: (open) => set({ timelineOverviewOpen: open }),
  setMemoryManagerOpen: (open) => set({ memoryManagerOpen: open }),
  apiKeyModalOpen: false,
  setApiKeyModalOpen: (open) => set({ apiKeyModalOpen: open }),
  responseViewerNodeId: null,
  setResponseViewerNodeId: (id) => set({ responseViewerNodeId: id }),
  autoBackupDir: null,
  setAutoBackupDir: (name) => set({ autoBackupDir: name }),
  lastAutoBackupAt: null,
  setLastAutoBackupAt: (t) => set({ lastAutoBackupAt: t }),
  backupDialogOpen: false,
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
  setBackupDialogOpen: (v) => set({ backupDialogOpen: v }),
  shareDialogUrl: null,
  setShareDialogUrl: (url) => set({ shareDialogUrl: url }),
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
  setAutoRefreshPaused: (paused) => {
    localStorage.setItem(AUTO_PAUSE_KEY, paused ? 'yes' : 'no');
    set({ autoRefreshPaused: paused });
  },
  setSelectedModel: (model) => {
    if (model) localStorage.setItem(MODEL_KEY, model);
    else localStorage.removeItem(MODEL_KEY);
    set({ selectedModel: model });
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
