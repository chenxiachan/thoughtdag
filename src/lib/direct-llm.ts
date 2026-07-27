import type { ContextMessage, ImageAttachment, StreamCallbacks } from './api';
import type { Reference } from '../types';
import { API_BASE } from './constants';
import { storedProviders, type RuntimeProvider } from './runtime-providers';

// Direct browser→gateway streaming. On the Workers deployment the proxy has
// a small per-request CPU allowance; big contexts + thinking models exhaust
// it and the stream dies mid-thought with no error frame. When the selected
// model belongs to a browser-configured OpenRouter provider, the app talks
// to the gateway directly instead (its API supports CORS) — the key never
// leaves the browser and context size is no longer bounded by proxy CPU.
// Local dev keeps the Node proxy: no CPU cap there, plus the richer tool
// loop (web_search / arxiv / scholar / MCP).

const isWorkerBackend = API_BASE === '';

// Endpoints verified to allow browser CORS: OpenRouter (documented) and
// Moonshot (preflight tested against .cn with the app origin). Others keep
// the proxy until tested — a CORS-blocked endpoint would fail 100% direct.
const DIRECT_CORS_OK = /openrouter\.ai|api\.moonshot\.(cn|ai)/i;
const isOpenRouterURL = (baseURL: string) => /openrouter\.ai/i.test(baseURL);

/** The provider to talk to directly for this model, or null → use the proxy.
    Scholar/MCP requests need the proxy's tool loop, except on OpenRouter
    (whose requests always ran direct, tools ignored as before). Web search
    does NOT force the proxy: OpenRouter searches via `:online`, and other
    direct gateways simply have no search — their toggles hide in the UI.
    A thinking model on the proxy dies of the CPU allowance mid-thought,
    which is strictly worse than answering without search. */
export function directProvider(modelId?: string, needsProxyTools?: boolean): RuntimeProvider | null {
  if (!isWorkerBackend || !modelId) return null;
  for (const p of storedProviders()) {
    if (!DIRECT_CORS_OK.test(p.baseURL)) continue;
    if (needsProxyTools && !isOpenRouterURL(p.baseURL)) continue;
    if (!p.apiKey) continue;
    if (p.models.some((m) => m.id === modelId)) return p;
  }
  return null;
}

/** True when this model's requests bypass the proxy on a gateway that cannot
    search (any direct lane except OpenRouter's `:online`). Search toggles
    hide for such models — search that cannot run must not be offerable. */
export function directWithoutSearch(modelId?: string): boolean {
  const p = directProvider(modelId);
  return !!p && !isOpenRouterURL(p.baseURL);
}

// Keep in sync with baseDirective() in server.mjs / functions/api/[[path]].js
function baseDirective(): string {
  return [
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    'Respond in the language of the latest user message unless asked otherwise.',
    'Bracketed markers such as [Note], [Reference: …], [Link snapshot: …], [Important]…[/Important] and [Stale: …] are provenance labels attached to your context by the canvas. Use them to judge where information came from and how much to trust it; never repeat the markers themselves in your answer.',
  ].join(' ');
}

type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
interface OpenAiMessage { role: 'system' | 'user' | 'assistant'; content: string | OpenAiContentPart[] }

function toOpenAiMessages(messages: ContextMessage[], images?: ImageAttachment[]): OpenAiMessage[] {
  const systemParts: string[] = [baseDirective()];
  const out: OpenAiMessage[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'system') { systemParts.push(m.content); return; }
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && images && images.length > 0) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.data}` },
          })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  });
  return [{ role: 'system', content: systemParts.join('\n\n') }, ...out];
}

function friendlyNetworkError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'AbortError') return err as unknown as Error;
  const message = err instanceof Error ? err.message : 'Unknown error';
  return new Error(
    /fetch|network/i.test(message)
      ? `Network error reaching the model gateway — check your connection. (${message})`
      : message
  );
}

interface UrlCitation { url?: string; title?: string }
interface SseChoice {
  delta?: { content?: string; reasoning?: string; reasoning_content?: string; annotations?: { type?: string; url_citation?: UrlCitation }[] };
  finish_reason?: string | null;
}
interface SseChunk { choices?: SseChoice[]; error?: { message?: string } | string }

interface StreamPassResult { text: string; finishReason: string }

async function streamOnePass(
  provider: RuntimeProvider,
  model: string,
  body: OpenAiMessage[],
  onText: (chunk: string) => void,
  onReasoning: (chunk: string) => void,
  citations: Map<string, Reference>,
  signal?: AbortSignal,
): Promise<StreamPassResult> {
  const res = await fetch(`${provider.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'ThoughtDAG',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: body,
      stream_options: { include_usage: true },
      // OpenRouter-only extensions; stricter endpoints reject unknown keys.
      // usage: detailed accounting (incl. cached_tokens) — chained follow-ups
      // share their upstream prefix, so provider prompt caches cut real cost.
      ...(isOpenRouterURL(provider.baseURL) ? { reasoning: { enabled: true }, usage: { include: true } } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason = 'unknown';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      let chunk: SseChunk;
      try { chunk = JSON.parse(data) as SseChunk; } catch { continue; }
      if (chunk.error) {
        const msg = typeof chunk.error === 'string' ? chunk.error : chunk.error.message;
        throw new Error(msg || 'Upstream stream error');
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) { text += delta.content; onText(delta.content); }
      const reasoning = delta?.reasoning ?? delta?.reasoning_content;
      if (reasoning) onReasoning(reasoning);
      for (const a of delta?.annotations ?? []) {
        const c = a.url_citation;
        if (c?.url && !citations.has(c.url)) {
          citations.set(c.url, { title: c.title || c.url, url: c.url, media: 'Web' });
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  }
  return { text, finishReason };
}

/**
 * Streaming call straight to the gateway, mirroring the proxy's behavior:
 * `:online` when web search is on, one plain-model retry if the online
 * variant closes with zero text, and a finish-reason diagnostic if the
 * model still produced nothing.
 */
export async function directLlmStream(
  provider: RuntimeProvider,
  modelId: string,
  contextMessages: ContextMessage[],
  onChunk: (chunk: string, fullSoFar: string) => void,
  signal?: AbortSignal,
  images?: ImageAttachment[],
  callbacks?: StreamCallbacks,
  webSearch?: boolean,
): Promise<string> {
  const body = toOpenAiMessages(contextMessages, images);
  // `:online` is an OpenRouter model-id suffix; other gateways 404 on it.
  const useOnline = isOpenRouterURL(provider.baseURL) && webSearch !== false;
  const citations = new Map<string, Reference>();
  let full = '';
  let reasoningFull = '';
  const onText = (chunk: string) => { full += chunk; onChunk(chunk, full); };
  const onReasoning = (chunk: string) => {
    reasoningFull += chunk;
    callbacks?.onReasoning?.(chunk, reasoningFull);
  };

  try {
    let pass = await streamOnePass(
      provider, useOnline ? `${modelId}:online` : modelId, body, onText, onReasoning, citations, signal);

    // :online sometimes closes with zero text (thinking models most of all):
    // retry once with the plain model so the user always gets an answer.
    if (useOnline && full.length === 0) {
      pass = await streamOnePass(provider, modelId, body, onText, onReasoning, citations, signal);
    }

    if (full.length === 0) {
      throw new Error(`Model produced no text (finish: ${pass.finishReason}, model: ${modelId}${useOnline ? ' via :online' : ''})`);
    }
    if (citations.size > 0) callbacks?.onSources?.([...citations.values()]);
    return full;
  } catch (err: unknown) {
    throw friendlyNetworkError(err);
  }
}

/** Non-streaming call straight to the gateway (background summaries etc.). */
export async function directLlmCall(
  provider: RuntimeProvider,
  modelId: string,
  contextMessages: ContextMessage[],
  images?: ImageAttachment[],
): Promise<string> {
  try {
    const res = await fetch(`${provider.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'ThoughtDAG',
      },
      body: JSON.stringify({ model: modelId, messages: toOpenAiMessages(contextMessages, images) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err: unknown) {
    throw friendlyNetworkError(err);
  }
}
