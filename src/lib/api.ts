import { API_BASE } from './constants';

const API_URL = `${API_BASE}/api/claude`;
const STREAM_URL = `${API_BASE}/api/stream`;
const PDF_EXTRACT_URL = `${API_BASE}/api/pdf-extract`;

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ImageAttachment {
  data: string; // base64
  mimeType: string;
}

export interface PdfExtractResult {
  text: string;
  numPages: number;
  images?: string[]; // base64 PNG per page (absent if poppler unavailable)
  imagesUnavailable?: boolean;
}

// Extract text + page images from a PDF via the proxy. Throws on HTTP errors.
export async function extractPdf(base64: string): Promise<PdfExtractResult> {
  const res = await fetch(PDF_EXTRACT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Legacy non-streaming call
export async function llmCall(contextMessages: ContextMessage[], images?: ImageAttachment[]): Promise<string> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages, images: images?.length ? images : undefined }),
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    
    const data = await res.json();
    return data.text;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return `⚠️ API Error: ${message}\n\nCheck that the proxy server is running (\`node server.mjs\`).`;
  }
}

// Streaming call — invokes onChunk with each text delta, returns full text
export async function llmCallStream(
  contextMessages: ContextMessage[],
  onChunk: (chunk: string, fullSoFar: string) => void,
  signal?: AbortSignal,
  images?: ImageAttachment[],
): Promise<string> {
  try {
    const res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: contextMessages, images: images?.length ? images : undefined }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            full += parsed.text;
            onChunk(parsed.text, full);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== data) throw e;
        }
      }
    }

    return full || 'No response';
  } catch (err: unknown) {
    // Re-throw AbortError so callers can handle stop-generation gracefully
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return `⚠️ API Error: ${message}\n\nCheck that the proxy server is running (\`node server.mjs\`).`;
  }
}
