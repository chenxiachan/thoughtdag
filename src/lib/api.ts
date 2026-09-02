import { API_BASE } from './constants';
import { toast, useUiStore } from './ui-store';
import { getModelsOnce } from './use-models';
import { t, fmt } from '../i18n';
import { storedProviders, storedVision, learnVision, pushProviders } from './runtime-providers';
import { setModelsCache } from './use-models';
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
  /** The image's companion text (its index) is already in the messages. */
  hasCompanion?: boolean;
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

export interface LinkSnapshot { title: string; text: string; fetchedAt: string; html?: string }

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


// The user's model choice outranks the vision stand-in: when the chosen
// model cannot see images but every image already has its companion text
// in the messages, drop the pixels and keep the model. The reroute (with
// its announcement + rescue) remains the fallback for UNindexed images.
async function imagesForModel(modelId: string | undefined, images?: ImageAttachment[]): Promise<ImageAttachment[] | undefined> {
  if (!images?.length) return images;
  const data = await getModelsOnce();
  // no explicit choice = the catalog default answers (mirror of the proxy)
  const effective = modelId ?? data?.default ?? undefined;
  const info = effective ? data?.models.find((m) => m.id === effective) : undefined;
  // explicit false only: unknown vision keeps the pixels so the first real
  // request can serve as the capability probe
  if (info && info.vision === false && images.every((i) => i.hasCompanion)) return undefined;
  return images;
}

// Direct connections bypass the proxy's vision reroute entirely: a text-only
// model reached browser-direct would receive raw image_url blocks and answer
// with a deserializer error in provider dialect. Refuse BEFORE the wire, in
// user language — the proxy path keeps its reroute + rescue instead.
async function guardDirectVision(modelId: string | undefined, images?: ImageAttachment[]): Promise<void> {
  if (!images?.length) return;
  const data = await getModelsOnce();
  const effective = modelId ?? data?.default ?? undefined;
  const info = effective ? data?.models.find((m) => m.id === effective) : undefined;
  if (info && info.vision === false) throw new Error(t('error.textOnlyModelImages'));
}

// Non-streaming call (used for background summaries)
export async function llmCall(contextMessages: ContextMessage[], images?: ImageAttachment[], modelOverride?: string): Promise<string> {
  const modelId = modelOverride || useUiStore.getState().selectedModel || undefined;
  images = await imagesForModel(modelId, images);
  const direct = directProvider(modelId);
  if (direct && modelId) {
    await guardDirectVision(modelId, images);
    return directLlmCall(direct, modelId, contextMessages, images);
  }
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
  /** The gateway's built-in web search is active for this generation. */
  onGatewaySearch?: () => void;
  /** All sources consulted during generation (sent once, at the end). */
  onSources?: (sources: import('../types').Reference[]) => void;
  /** Reasoning/thinking tokens (models that emit them; never enters context). */
  onReasoning?: (chunk: string, fullSoFar: string) => void;
  /** The chosen model cannot see images: a vision model answers instead. */
  onRerouted?: (from: string, to: string) => void;
  /** The request is leaving — exactly this payload, after every image
      substitution or drop, on this lane. Fires again on a retry. */
  onDispatch?: (payload: { messages: ContextMessage[]; images: ImageAttachment[]; model: string; toolPrefs: ToolPrefs; lane: 'direct' | 'proxy' }) => void;
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
  images = await imagesForModel(modelId, images);

  // The proxy substituting a vision stand-in is a verdict on the model's
  // OWN eyes — a run that got rerouted must not teach vision:true below.
  let rerouted = false;
  const cbs: StreamCallbacks = {
    ...callbacks,
    onRerouted: (from, to) => { rerouted = true; callbacks?.onRerouted?.(from, to); },
  };

  // One pass through whichever lane this deployment uses (browser-direct on
  // Workers, the local proxy everywhere else — including the desktop app).
  const sendOnce = async (imgs: ImageAttachment[] | undefined, chunkCb: typeof onChunk): Promise<string> => {
    const direct = directProvider(modelId);
    if (direct && modelId) {
      await guardDirectVision(modelId, imgs);
      callbacks?.onDispatch?.({ messages: contextMessages, images: imgs ?? [], model: modelId, toolPrefs: toolPrefs ?? {}, lane: 'direct' });
      return directLlmStream(direct, modelId, contextMessages, chunkCb, signal, imgs, cbs, toolPrefs?.web);
    }
    callbacks?.onDispatch?.({ messages: contextMessages, images: imgs ?? [], model: modelId ?? '', toolPrefs: toolPrefs ?? {}, lane: 'proxy' });
    return proxyStream(imgs, chunkCb);
  };

  // ── Lazy capability learning ──
  // Providers don't publish vision metadata (only OpenRouter does), so for
  // a browser-configured model nobody has declared, the first real image
  // request IS the probe. Success writes vision:true back; a pre-stream
  // failure gets one pixel-free retry, and only THAT retry succeeding pins
  // the blame on the images (differential diagnosis — a transient error
  // never mislabels). Server-.env and gateway models keep their own paths.
  const declared = modelId ? storedVision(modelId) : undefined;
  const isStored = !!modelId && storedProviders().some((p) => p.models.some((m) => m.id === modelId));
  if (images?.length && modelId && isStored && declared !== false) {
    const short = modelId.split('/').pop() ?? modelId;
    const learn = (vision: boolean, toastKey: 'toast.visionLearnedTrue' | 'toast.visionLearnedFalse') => {
      if (!learnVision(modelId, vision)) return;
      void pushProviders(storedProviders()).then(setModelsCache).catch(() => {});
      toast('info', fmt(t(toastKey), { m: short }));
    };
    let emitted = false;
    try {
      const text = await sendOnce(images, (chunk, full) => { emitted = true; onChunk(chunk, full); });
      if (declared === undefined && !rerouted && text.trim()) learn(true, 'toast.visionLearnedTrue');
      return text;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (emitted || rerouted) throw err; // mid-stream failures are not capability verdicts
      if (declared === true) {
        // a hand-declared vision mark failed on images: keep the failure,
        // point at the switch that can fix it
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${msg} ${t('error.visionDeclaredHint')}`);
      }
      const text = await sendOnce(undefined, onChunk);
      if (text.trim()) learn(false, 'toast.visionLearnedFalse');
      return text;
    }
  }
  return sendOnce(images, onChunk);

  async function proxyStream(imgs: ImageAttachment[] | undefined, chunkCb: typeof onChunk): Promise<string> {
  try {
    const res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: contextMessages,
        images: imgs?.length ? imgs : undefined,
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
            chunkCb(parsed.text, full);
          }
          if (parsed.reasoning) {
            reasoningFull += parsed.reasoning;
            cbs.onReasoning?.(parsed.reasoning, reasoningFull);
          }
          if (parsed.tool?.query) {
            cbs.onToolCall?.(parsed.tool.name, parsed.tool.query);
          }
          if (parsed.gatewaySearch) {
            cbs.onGatewaySearch?.();
          }
          if (Array.isArray(parsed.sources)) {
            cbs.onSources?.(parsed.sources);
          }
          // model substitution is never silent: say who answers, and why
          if (parsed.rerouted?.to) {
            toast('info', fmt(t('toast.visionRerouted'), { from: parsed.rerouted.from, to: parsed.rerouted.to }), 7000);
            cbs.onRerouted?.(parsed.rerouted.from, parsed.rerouted.to);
          }
          if (parsed.imageFallback?.model) {
            toast('info', fmt(t('toast.imagesAsText'), { model: parsed.imageFallback.model }), 9000);
            cbs.onImageFallback?.(parsed.imageFallback.model);
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
}
