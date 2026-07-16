// Base URL of the LLM proxy. Dev defaults to the local server.mjs; a
// production build defaults to SAME-ORIGIN /api/* (the deployment's worker
// serves it) — zero-config correct on any host. Override with VITE_API_BASE
// when the proxy runs elsewhere (e.g. a static build against a LAN proxy).
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

// PDFs above this page count default to text-only context (Vision page images
// would cost ~1500 tokens per page).
export const PDF_VISION_PAGE_THRESHOLD = 10;

// Undo stack depth (full-graph snapshots).
export const HISTORY_LIMIT = 50;

// Rendered node card width (ThoughtNode w-[520px]).
export const NODE_CSS_WIDTH = 520;

// Layout column pitch — wider than the card so edges have breathing room.
export const LAYOUT_COL_WIDTH = 540;
export const LAYOUT_H_GAP = 80;
export const LAYOUT_V_GAP = 100;

// Collapsed node card height, used by layout estimation and collapse shifting.
export const COLLAPSED_NODE_HEIGHT = 80;

// JS mirror of the @theme design tokens in src/index.css — for ReactFlow
// edge styles / markers / minimap, which take literal color values.
// Keep in sync with index.css.
export const COLORS = {
  surface: '#FAF9F7',
  card: '#FFFFFF',
  line: '#E8E5E0',
  inkMuted: '#6B6560',
  accent: '#6B5CE7',   // continue edges, primary actions
  warm: '#E08A3C',     // explore branch edges
  trace: '#F59E0B',    // ancestor-path highlight
  watch: '#DC2626',    // evaluator watch edges
} as const;

// Frame palette — FIXED set (no picker): frames are navigation objects, so
// color is function, not decoration. Tokens referenced by FrameNode + the
// frame navigator.
export const FRAME_COLORS: Record<string, { border: string; bg: string; dot: string }> = {
  gray: { border: 'border-ink/15', bg: 'bg-ink/[0.03]', dot: 'bg-ink/30' },
  violet: { border: 'border-accent/40', bg: 'bg-accent/[0.05]', dot: 'bg-accent' },
  amber: { border: 'border-amber-400/60', bg: 'bg-amber-400/[0.07]', dot: 'bg-amber-400' },
  green: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/[0.05]', dot: 'bg-emerald-500' },
  sky: { border: 'border-sky-500/40', bg: 'bg-sky-500/[0.05]', dot: 'bg-sky-500' },
  rose: { border: 'border-rose-400/50', bg: 'bg-rose-400/[0.06]', dot: 'bg-rose-400' },
};

// Focus panel overlay: the panel floats OVER the canvas (the canvas never
// resizes). Width is user-resizable and persisted; App reads it to nudge
// the viewport when the selected node would be hidden underneath.
export const PANEL_WIDTH_KEY = 'thoughtdag.panelWidth';
export const PANEL_MIN_WIDTH = 380;
export const PANEL_DEFAULT_WIDTH = 520;
export const PANEL_INSET = 12; // matches right-3/top-3/bottom-3

export function loadPanelWidth(): number {
  const raw = localStorage.getItem(PANEL_WIDTH_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : PANEL_DEFAULT_WIDTH;
}
