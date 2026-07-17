// ThoughtDAG public-deployment proxy — Cloudflare Pages Functions.
//
// The DEMO twin of server.mjs: same wire protocol, radically narrower
// trust model. There is NO .env here by design — every generation request
// carries the visitor's own provider set (stateless BYOK, see server.mjs
// providerEntries), a per-request registry is built and forgotten with
// the response. Nothing is stored: no keys, no content, no users.
//
// Deliberately absent vs the local proxy: web search (would spend the
// operator's search-API key), MCP (local-machine feature), PDF extraction
// (needs poppler; the frontend degrades gracefully), .env providers.
// Scholarly search stays — arXiv / Semantic Scholar are free public APIs.

import { streamText, generateText, tool, stepCountIs, smoothStream } from 'ai';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// No output cap is sent: providers apply their own defaults, and a cap
// larger than a model's allowed max makes some upstreams reject outright.
const isOpenRouter = (baseURL) => /openrouter\.ai/i.test(String(baseURL));

// ── per-request provider registry (mirror of server.mjs providerEntries) ──
function providerEntries(providers) {
  const out = {};
  for (const p of (Array.isArray(providers) ? providers : []).slice(0, 12)) {
    const baseURL = String(p.baseURL ?? '').replace(/\/$/, '');
    if (!baseURL) continue;
    const name = String(p.name || 'Custom').slice(0, 40);
    const make = createOpenAICompatible({
      name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      apiKey: p.apiKey || 'none',
      baseURL,
    });
    const extra = isOpenRouter(baseURL)
      ? { providerOptions: { openrouter: { reasoning: { enabled: true } } } }
      : {};
    const models = (Array.isArray(p.models) ? p.models : [])
      .map((m) => (typeof m === 'string' ? { id: m } : m))
      .filter((m) => m && m.id).slice(0, 60);
    for (const m of models) {
      if (out[m.id]) continue;
      const shortId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
      out[m.id] = {
        name: `${shortId} (${name})`, provider: name, vision: !!m.vision,
        model: () => make(m.id), ...extra,
        // OpenRouter's :online variant makes the GATEWAY search the web —
        // same key, no extra configuration
        ...(isOpenRouter(baseURL) ? { online: () => make(`${m.id}:online`) } : {}),
      };
    }
  }
  return out;
}

function resolveModel(modelId, hasImages, providers) {
  const reg = providerEntries(providers);
  const entry = reg[modelId] || reg[Object.keys(reg)[0]];
  if (!entry) return null;
  if (hasImages && !entry.vision) {
    const anyVision = Object.values(reg).find((m) => m.vision);
    if (anyVision) return anyVision;
  }
  return entry;
}

// ── prompt assembly (mirror of server.mjs) ──
function baseDirective() {
  return [
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    'Respond in the language of the latest user message unless asked otherwise.',
    'Bracketed markers such as [Note], [Reference: …], [Link snapshot: …], [Important]…[/Important] and [Stale: …] are provenance labels attached to your context by the canvas. Use them to judge where information came from and how much to trust it; never repeat the markers themselves in your answer.',
  ].join(' ');
}

function toSdkPrompt(messages, images) {
  const systemParts = [];
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'system') { systemParts.push(m.content); continue; }
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && images && images.length > 0) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...images.map((img) => ({ type: 'file', data: img.data, mediaType: img.mimeType || 'image/png' })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return { system: [baseDirective(), ...systemParts].join('\n\n'), messages: out };
}

// ── scholarly search (free public APIs — mirror of server.mjs) ──
async function arxivSearch(query, maxResults = 5) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`arXiv HTTP ${r.status}`);
  const xml = await r.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const field = (s, tag) => {
    const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  };
  return entries.map((e) => ({
    title: field(e, 'title'),
    url: field(e, 'id').replace('http://', 'https://'),
    content: field(e, 'summary').slice(0, 600),
    media: 'arXiv',
    date: field(e, 'published').slice(0, 10) || undefined,
    authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]).slice(0, 3).join(', '),
  }));
}

async function semanticScholarSearch(query, limit = 5) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,year,citationCount,url,authors`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Semantic Scholar HTTP ${r.status}`);
  const data = await r.json();
  return (data.data || []).map((p) => ({
    title: p.title,
    url: p.url || undefined,
    content: `${(p.abstract || '').slice(0, 500)}${p.citationCount != null ? ` (cited ${p.citationCount}×)` : ''}`,
    media: 'Semantic Scholar',
    date: p.year ? String(p.year) : undefined,
    authors: (p.authors || []).map((a) => a.name).slice(0, 3).join(', '),
  }));
}

function makeTools(sources, onSearch, prefs = {}) {
  const pushNumbered = (results) => {
    const start = sources.length;
    sources.push(...results);
    if (results.length === 0) return 'No results found.';
    return results
      .map((r, i) => `[${start + i + 1}] ${r.title}${r.authors ? ` — ${r.authors}` : ''}${r.date ? ` (${r.date})` : ''}\n${r.url ?? ''}\n${r.content}`)
      .join('\n\n');
  };
  const tools = {};
  if (prefs.scholar !== false) {
    tools.arxiv_search = tool({
      description:
        'Search arXiv for academic papers and preprints (physics, math, CS, ML, stats…). ' +
        'ONLY when the user asks about papers or literature, or a claim genuinely needs a scholarly citation — not for questions you can answer directly. Returns title, authors, abstract, and link, numbered for [n] citations.',
      inputSchema: z.object({ query: z.string().describe('Search terms — paper title, topic, method, or author. English works best on arXiv.') }),
      execute: async ({ query }) => {
        onSearch?.('arxiv_search', query);
        try { return pushNumbered(await arxivSearch(query)); }
        catch (e) { return `arXiv search failed (${e.message}) — try semantic_scholar or answer from your knowledge.`; }
      },
    });
    tools.semantic_scholar = tool({
      description:
        'Search Semantic Scholar across all scholarly fields — includes citation counts, useful for judging impact and finding published (peer-reviewed) work beyond preprints. Numbered for [n] citations.',
      inputSchema: z.object({ query: z.string().describe('Search terms — topic, title, or author, in English') }),
      execute: async ({ query }) => {
        onSearch?.('semantic_scholar', query);
        try { return pushNumbered(await semanticScholarSearch(query)); }
        catch (e) { return `Semantic Scholar search failed (${e.message}) — try arxiv_search or answer from your knowledge.`; }
      },
    });
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

// ── routes ──
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function handleStream(body) {
  const { messages, model: modelId, images, webSearch, scholarSearch, providers } = body;
  const entry = resolveModel(modelId, images && images.length > 0, providers);
  if (!entry) return json({ error: 'No model configured. Add an API key first.' }, 503);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const sources = [];
      let emittedChars = 0;
      let charsAtLastSearch = 0;
      const tools = makeTools(sources, (name, query) => {
        charsAtLastSearch = emittedChars;
        write({ tool: { name, query } });
      }, { scholar: scholarSearch !== false });

      const useOnline = webSearch !== false && !!entry.online;
      const prompt = toSdkPrompt(messages, images);
      if (tools) {
        const directive = [
          'Tools are AVAILABLE, not mandatory: first decide whether your own knowledge answers the question. Conceptual, definitional, reasoning and creative questions must be answered DIRECTLY, with no tool calls. Search only when the answer depends on current events, specific verifiable facts you are unsure of, or literature citations — or when the user explicitly asks you to look something up.',
          'After using any search tool, you MUST follow up with a complete answer that SYNTHESIZES the results in your own words — analyze and conclude, never just list the results.',
          "Cite sources inline as [n], using EXACTLY the bracket numbers shown in this turn's search results (they always start at [1]). Ignore any citation numbers appearing in earlier conversation messages — they refer to different sources.",
          'If the search results are not actually relevant to the question, say so explicitly and answer from your own knowledge instead of forcing citations.',
          'Never end your turn immediately after a search.',
        ].join(' ');
        prompt.system = prompt.system ? `${prompt.system}\n\n${directive}` : directive;
      }

      try {
        const result = streamText({
          model: useOnline ? entry.online() : entry.model(),
          system: prompt.system,
          messages: prompt.messages,
          providerOptions: entry.providerOptions,
          tools,
          experimental_transform: smoothStream({ chunking: /[\u3040-\u30ff\u4e00-\u9fff]|\S+\s+/ }),
          stopWhen: stepCountIs(5),
          prepareStep: ({ stepNumber }) =>
            stepNumber >= 3 && tools
              ? {
                  activeTools: [],
                  instructions:
                    (prompt.system ? prompt.system + '\n\n' : '') +
                    'The search tool is NO LONGER available. Based on the search results above, write your FINAL synthesized answer now, citing sources as [n]. Do not attempt any further searches and do not emit tool-call syntax.',
                }
              : undefined,
        });

        // <tool_call> leak filter (mirror of server.mjs)
        let holdback = '';
        const emitFiltered = (chunk) => {
          let buf = holdback + chunk;
          holdback = '';
          buf = buf.replace(/<tool_call>[\s\S]*?<\/tool_call>\n?/g, '');
          const open = buf.search(/<tool_call/);
          if (open !== -1) { holdback = buf.slice(open); buf = buf.slice(0, open); }
          else {
            for (let k = Math.min(buf.length, 10); k > 0; k--) {
              if ('<tool_call'.startsWith(buf.slice(-k))) { holdback = buf.slice(-k); buf = buf.slice(0, -k); break; }
            }
          }
          if (buf) { emittedChars += buf.length; write({ text: buf }); }
        };

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') emitFiltered(part.text);
          else if (part.type === 'reasoning-delta' && part.text) write({ reasoning: part.text });
          else if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error(String(part.errorText ?? part.error));
        }
        if (holdback && !holdback.startsWith('<tool_call')) { emittedChars += holdback.length; write({ text: holdback }); }

        // :online sometimes closes with zero text (thinking models most of
        // all) — retry once with the plain model so the visitor always gets
        // an answer; the search just silently didn't happen this turn.
        if (useOnline && emittedChars === 0) {
          const retry = streamText({
            model: entry.model(), system: prompt.system, messages: prompt.messages,
            providerOptions: entry.providerOptions,
          });
          for await (const part of retry.fullStream) {
            if (part.type === 'text-delta') { emittedChars += part.text.length; write({ text: part.text }); }
            else if (part.type === 'reasoning-delta' && part.text) write({ reasoning: part.text });
            else if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error(String(part.errorText ?? part.error));
          }
        }

        // synthesis fallback: searched but wrote almost nothing after it
        if (sources.length > 0 && emittedChars - charsAtLastSearch < 200) {
          const numbered = sources
            .map((r, i) => `[${i + 1}] ${r.title}${r.authors ? ` — ${r.authors}` : ''}${r.date ? ` (${r.date})` : ''}\n${r.url ?? ''}\n${r.content}`)
            .join('\n\n');
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          const synth = streamText({
            model: entry.model(),
            system: prompt.system,
            messages: [
              ...prompt.messages,
              {
                role: 'user',
                content:
                  `Search results:\n\n${numbered}\n\n` +
                  `Based on these results and your own knowledge, write the final synthesized answer to my previous question` +
                  `${lastUser ? ` ("${String(lastUser.content).slice(0, 200)}")` : ''}. ` +
                  'Analyze rather than list; cite sources inline as [n] using the numbers above; if the results are not relevant, say so and answer from your own knowledge.',
              },
            ],
            providerOptions: entry.providerOptions,
          });
          for await (const part of synth.fullStream) {
            if (part.type === 'text-delta') write({ text: part.text });
            else if (part.type === 'reasoning-delta' && part.text) write({ reasoning: part.text });
          }
        }

        if (sources.length > 0) write({ sources });
        const usage = await result.totalUsage;
        if (usage) write({ usage });
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      } catch (err) {
        let message = err?.message || 'LLM request failed';
        if (/context.{0,20}(length|window)|maximum.{0,20}tokens|too (long|many tokens)|input.{0,10}too large/i.test(message)) {
          message = `Context exceeds the model's window. Prune upstream: collapse nodes to summaries, archive dead ends, or switch a reference edge back to quote depth. (${message})`;
        }
        write({ error: message });
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

async function handleClaude(body) {
  const { messages, model: modelId, images, providers } = body;
  const entry = resolveModel(modelId, images && images.length > 0, providers);
  if (!entry) return json({ error: 'No model configured. Add an API key first.' }, 503);
  try {
    const prompt = toSdkPrompt(messages, images);
    const result = await generateText({
      model: entry.model(),
      system: prompt.system,
      messages: prompt.messages,
      providerOptions: entry.providerOptions,
    });
    return json({ text: result.text });
  } catch (err) {
    return json({ error: err?.message || 'LLM request failed' }, 502);
  }
}

async function handleProbeModels(body) {
  const { baseURL, apiKey } = body ?? {};
  if (!baseURL) return json({ error: 'baseURL required' }, 400);
  try {
    const r = await fetch(`${String(baseURL).replace(/\/$/, '')}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return json({ error: `endpoint answered HTTP ${r.status}` }, r.status);
    const data = await r.json();
    const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const models = list.map((m) => ({
      id: m.id ?? m.name,
      ...(typeof m.created === 'number' ? { created: m.created } : {}),
      ...(m.architecture?.input_modalities ? { vision: m.architecture.input_modalities.includes('image') } : {}),
    })).filter((m) => m.id);
    return json({ models });
  } catch (err) {
    return json({ error: `could not reach the endpoint: ${err.message}` }, 502);
  }
}

function modelsPayloadFor(providers) {
  const overlay = providerEntries(providers);
  const models = Object.entries(overlay).map(([id, m]) => ({ id, name: m.name, provider: m.provider, vision: m.vision }));
  return {
    models,
    default: models[0]?.id ?? null,
    capabilities: {
      webSearch: Object.values(overlay).some((m) => m.online),
      searchEngine: 'openrouter-online',
      scholarSearch: true,
      vision: models.some((m) => m.vision),
    },
  };
}

async function handleFetchUrl(body) {
  const { url } = body || {};
  try {
    const parsed = new URL(String(url));
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http(s) URLs are supported');
    const host = parsed.hostname;
    if (
      host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === '::1' || host === '[::1]'
    ) throw new Error('Refusing to fetch private addresses');
    const r = await fetch(parsed.href, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ThoughtDAG/0.1; link snapshot)' },
    });
    if (!r.ok) throw new Error(`Page responded HTTP ${r.status}`);
    const type = r.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error(`Unsupported content type: ${type}`);
    const html = (await r.text()).slice(0, 800_000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*(\s*\n\s*)+/g, '\n\n')
      .trim()
      .slice(0, 15_000);
    return json({ title, text, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return json({ error: err.message || 'Fetch failed' }, 400);
  }
}

export async function onRequest({ request, params }) {
  const path = '/' + (Array.isArray(params.path) ? params.path.join('/') : params.path ?? '');
  const method = request.method;

  if (method === 'GET' && path === '/models') return json(modelsPayloadFor([]));
  if (method === 'GET' && path === '/tools') return json({ mcpServers: [] });

  if (method !== 'POST') return json({ error: 'Not found' }, 404);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  switch (path) {
    case '/stream': return handleStream(body);
    case '/claude': return handleClaude(body);
    case '/probe-models': return handleProbeModels(body);
    case '/runtime-providers': return json(modelsPayloadFor(body?.providers));
    case '/runtime-key': return json(modelsPayloadFor(body?.key ? [{
      name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', apiKey: body.key,
      models: (Array.isArray(body.models) && body.models.length > 0 ? body.models : ['openrouter/auto']).map((id) => (typeof id === 'string' ? { id } : id)),
    }] : []));
    case '/fetch-url': return handleFetchUrl(body);
    case '/pdf-extract': return json({ error: 'PDF extraction runs on the local proxy only — the file still attaches; text extraction is skipped on the demo deployment.' }, 501);
    default: return json({ error: 'Not found' }, 404);
  }
}
