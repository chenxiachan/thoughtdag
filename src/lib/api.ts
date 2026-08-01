import { API_BASE } from './constants';
import { toast, useUiStore } from './ui-store';
import { t, fmt } from '../i18n';
import { storedProviders } from './runtime-providers';
import { directProvider, directLlmStream, directLlmCall } from './direct-llm';
import { errorText } from './error-text';

const API_URL = `${API_BASE}/api/claude`;
// Providers only travel when configured; undefined keeps .env-only setups
// byte-identical to before.
const statelessProviders = () => {
  const p = storedProviders();
  return p.length > 0 ? p : undefined;
};

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
    throw new Error(errorText(err, `HTTP ${res.status}`));
  }
  return res.json();
}

export interface LinkSnapshot { title: string; text: string; fetchedAt: string }

// Server-side URL fetch for link nodes (browsers can't: CORS). Returns a
// stamped text snapshot — see /api/fetch-url in server.mjs.
export async function fetchUrlSnapshot(url: string): Promise<LinkSnapshot> {
  try {
    const res = await fetch(`${API_BASE}/api/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      // Our endpoint always answers JSON; a non-JSON 404 is Express itself
      // saying the route doesn't exist — i.e. a proxy started before the
      // endpoint was added. Tell the user the actual fix.
      const err = await res.json().catch(() => ({
        error: res.status === 404
          ? 'Proxy has no /api/fetch-url — restart it (npm run server)'
          : `HTTP ${res.status}`,
      }));
      throw new Error(errorText(err, `HTTP ${res.status}`));
    }
    return res.json();
  } catch (err: unknown) {
    throw wrapError(err); // network failures get the "is the proxy running?" hint
  }
}

// Wrap transport failures with an actionable hint. Errors always THROW —
// callers decide how to surface them (toast, placeholder, silent).
function wrapError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'AbortError') return err as unknown as Error;
  const message = err instanceof Error ? err.message : 'Unknown error';
  return new Error(
    /fetch|network|Failed to fetch/i.test(message)
      ? `${message} — is the proxy running? (npm run server)`
      : message
  );
}

// Non-streaming call (used for background summaries)
export async function llmCall(contextMessages: ContextMessage[], images?: ImageAttachment[], modelOverride?: string): Promise<string> {
  const modelId = modelOverride || useUiStore.getState().selectedModel || undefined;
  const direct = directProvider(modelId);
  if (direct && modelId) return directLlmCall(direct, modelId, contextMessages, images);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: contextMessages,
        images: images?.length ? images : undefined,
        model: modelOverride || useUiStore.getState().selectedModel || undefined,
        // browser-configured providers ride along on EVERY request — the
        // proxy builds a per-request registry and forgets it (stateless)
        providers: statelessProviders(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorText(err, `HTTP ${res.status}`));
    }

    const data = await res.json();
    return data.text;
  } catch (err: unknown) {
    throw wrapError(err);
  }
}

export interface StreamCallbacks {
  /** The model started a tool call (web_search / arxiv_search / semantic_scholar). */
  onToolCall?: (name: string, query: string) => void;
  /** All sources consulted during generation (sent once, at the end). */
  onSources?: (sources: import('../types').Reference[]) => void;
  /** Reasoning/thinking tokens (models that emit them; never enters context). */
  onReasoning?: (chunk: string, fullSoFar: string) => void;
  /** The chosen model cannot see images: a vision model answers instead. */
  onRerouted?: (from: string, to: string) => void;
  /** The vision stand-in failed; the original model answers from the
      images' companion text. */
  onImageFallback?: (model: string) => void;
}

export interface ToolPrefs {
  web?: boolean;
  scholar?: boolean;
  mcp?: boolean;
}

// Streaming call — invokes onChunk with each text delta, returns full text
export async function llmCallStream(
  contextMessages: ContextMessage[],
  onChunk: (chunk: string, fullSoFar: string) => void,
  signal?: AbortSignal,
  images?: ImageAttachment[],
  callbacks?: StreamCallbacks,
  toolPrefs?: ToolPrefs,
  modelOverride?: string,
): Promise<string> {
  // On the Workers deployment, OpenRouter models stream straight from the
  // browser — the proxy's CPU allowance can't survive big contexts + heavy
  // thinking models, and the key staying local is a feature in itself.
  const modelId = modelOverride || useUiStore.getState().selectedModel || undefined;
  const direct = directProvider(modelId, !!(toolPrefs?.scholar || toolPrefs?.mcp));
  if (direct && modelId) {
    return directLlmStream(direct, modelId, contextMessages, onChunk, signal, images, callbacks, toolPrefs?.web);
  }
  try {
    const res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: contextMessages,
        images: images?.length ? images : undefined,
        webSearch: toolPrefs?.web,
        scholarSearch: toolPrefs?.scholar,
        mcpTools: toolPrefs?.mcp,
        ...(useUiStore.getState().searchEnginePref !== 'server'
          ? { searchEngine: useUiStore.getState().searchEnginePref }
          : {}),
        ...(useUiStore.getState().anysearchKey ? { anysearchKey: useUiStore.getState().anysearchKey } : {}),
        model: modelOverride || useUiStore.getState().selectedModel || undefined,
        providers: statelessProviders(),
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorText(err, `HTTP ${res.status}`));
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let reasoningFull = '';

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
          if (parsed.error) throw new Error(errorText(parsed.error, 'Upstream stream error'));
          if (parsed.text) {
            full += parsed.text;
            onChunk(parsed.text, full);
          }
          if (parsed.reasoning) {
            reasoningFull += parsed.reasoning;
            callbacks?.onReasoning?.(parsed.reasoning, reasoningFull);
          }
          if (parsed.tool?.query) {
            callbacks?.onToolCall?.(parsed.tool.name, parsed.tool.query);
          }
          if (Array.isArray(parsed.sources)) {
            callbacks?.onSources?.(parsed.sources);
          }
          // model substitution is never silent: say who answers, and why
          if (parsed.rerouted?.to) {
            toast('info', fmt(t('toast.visionRerouted'), { from: parsed.rerouted.from, to: parsed.rerouted.to }), 7000);
            callbacks?.onRerouted?.(parsed.rerouted.from, parsed.rerouted.to);
          }
          if (parsed.imageFallback?.model) {
            toast('info', fmt(t('toast.imagesAsText'), { model: parsed.imageFallback.model }), 9000);
            callbacks?.onImageFallback?.(parsed.imageFallback.model);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== data) throw e;
        }
      }
    }

    // An empty stream returns empty — the caller turns it into a retryable
    // failure. (This used to return a literal 'No response' string, which
    // masqueraded as a real answer and bypassed the empty-output handling.)
    return full;
  } catch (err: unknown) {
    // AbortError passes through untouched for stop-generation handling
    throw wrapError(err);
  }
}
