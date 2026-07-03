// Base URL of the LLM proxy (server.mjs). Override with VITE_API_BASE if the
// proxy runs on a non-default host/port.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';

// PDFs above this page count default to text-only context (Vision page images
// would cost ~1500 tokens per page).
export const PDF_VISION_PAGE_THRESHOLD = 10;

// Undo stack depth (full-graph snapshots).
export const HISTORY_LIMIT = 50;

// Rendered node card width (ThoughtNode w-[480px]).
export const NODE_CSS_WIDTH = 480;

// Layout column pitch — wider than the card so edges have breathing room.
export const LAYOUT_COL_WIDTH = 500;
export const LAYOUT_H_GAP = 80;
export const LAYOUT_V_GAP = 100;

// Collapsed node card height, used by layout estimation and collapse shifting.
export const COLLAPSED_NODE_HEIGHT = 80;
