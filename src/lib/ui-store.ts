import { create } from 'zustand';

// Transient UI state (toasts, confirm dialog) — deliberately separate from
// the main store: no persistence, no undo history, and the imperative API
// below works from non-React modules (e.g. store/streaming.ts).

export interface ToastItem {
  id: string;
  kind: 'error' | 'success' | 'info';
  message: string;
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
  setPanelOpen: (open: boolean) => void;
  setSelectedModel: (model: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirmRequest: null,
  tutorialOpen: false,
  webSearchEnabled: localStorage.getItem(WEB_SEARCH_KEY) !== 'off',
  scholarSearchEnabled: localStorage.getItem(SCHOLAR_SEARCH_KEY) !== 'off',
  mcpEnabled: localStorage.getItem(MCP_KEY) !== 'off',
  autoRefreshPaused: localStorage.getItem(AUTO_PAUSE_KEY) === 'yes',
  annotationsHidden: localStorage.getItem(HIDE_ANNOTATIONS_KEY) === 'yes',
  panelOpen: false,
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

let toastCounter = 0;

/** Show a toast (bottom-right). duration 0 = sticky until dismissed. */
export function toast(kind: ToastItem['kind'], message: string, duration = 5000) {
  const id = `toast-${++toastCounter}`;
  useUiStore.setState((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
  if (duration > 0) {
    setTimeout(() => useUiStore.getState().dismissToast(id), duration);
  }
}

/** Promise-style in-app replacement for window.confirm(). */
export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    // A newer request supersedes an unresolved one.
    useUiStore.getState().confirmRequest?.resolve(false);
    useUiStore.setState({ confirmRequest: { ...opts, resolve } });
  });
}
