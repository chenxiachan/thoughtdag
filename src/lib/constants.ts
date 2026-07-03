// Base URL of the LLM proxy (server.mjs). Override with VITE_API_BASE if the
// proxy runs on a non-default host/port.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';

// PDFs above this page count default to text-only context (Vision page images
// would cost ~1500 tokens per page).
export const PDF_VISION_PAGE_THRESHOLD = 10;
