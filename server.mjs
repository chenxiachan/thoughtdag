import express from 'express';
import cors from 'cors';
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Environment ────────────────────────────────────────────────
// Minimal .env loader (avoids dotenv dependency and Node --env-file version quirks)
try {
  for (const line of fs.readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* .env is optional — env vars may come from the shell */ }

const ZHIPU_KEY = process.env.ZHIPU_API_KEY;
const QWEN_KEY = process.env.DASHSCOPE_API_KEY;
const PORT = Number(process.env.PORT) || 3001;

// Optional dependency: poppler's pdftoppm renders PDF pages as images for Vision.
// Without it, PDF attachments fall back to extracted text only.
let POPPLER_AVAILABLE = true;
try {
  execSync('pdftoppm -v', { stdio: 'ignore' });
} catch {
  POPPLER_AVAILABLE = false;
  console.warn('⚠ pdftoppm (poppler) not found — PDF page rendering disabled, text-only fallback.');
  console.warn('  Install with: brew install poppler');
}

// ─── Model Configuration (Vercel AI SDK providers) ──────────────
// Every provider registers only when its API key is present in .env.
// Default model IDs can be overridden per provider with <PREFIX>_MODELS
// (comma-separated), so new model releases never require a code change:
//   OPENAI_MODELS="gpt-5.2,gpt-5.2-mini"  ANTHROPIC_MODELS="claude-opus-4-8"

// id → { name, provider, vision, visionFallback?, model(), providerOptions? }
const modelRegistry = {};

const envModels = (prefix, fallback) => {
  const raw = process.env[`${prefix}_MODELS`];
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
};
const register = (ids, provider, make, opts = {}) => {
  for (const id of ids) {
    modelRegistry[id] = { name: `${id} (${provider})`, provider, vision: opts.vision ?? true, model: () => make(id), ...opts, ...(opts.perId?.[id] || {}) };
  }
};

if (ZHIPU_KEY) {
  const zhipu = createZhipu({ apiKey: ZHIPU_KEY, baseURL: 'https://open.bigmodel.cn/api/paas/v4' });
  modelRegistry['glm-4.5-flash'] = {
    name: 'GLM-4.5 Flash · free', provider: 'Zhipu', vision: false, visionFallback: 'glm-4v-flash',
    model: () => zhipu('glm-4.5-flash'),
    // GLM-4.5 defaults to hidden "thinking" — disable for fast first tokens
    providerOptions: { zhipu: { thinking: { type: 'disabled' } } },
  };
  modelRegistry['glm-4v-flash'] = {
    name: 'GLM-4V Flash · free vision', provider: 'Zhipu', vision: true, model: () => zhipu('glm-4v-flash'),
  };
}

if (QWEN_KEY) {
  const qwen = createOpenAICompatible({
    name: 'dashscope', apiKey: QWEN_KEY,
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  });
  modelRegistry['qwen-plus'] = {
    name: 'Qwen Plus', provider: 'Qwen', vision: false, visionFallback: 'qwen-vl-plus', model: () => qwen('qwen-plus'),
  };
  modelRegistry['qwen-vl-plus'] = {
    name: 'Qwen VL Plus', provider: 'Qwen', vision: true, model: () => qwen('qwen-vl-plus'),
  };
}

if (process.env.OPENAI_API_KEY) {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  register(envModels('OPENAI', ['gpt-5.1', 'gpt-5-mini']), 'OpenAI', (id) => openai(id));
}

if (process.env.ANTHROPIC_API_KEY) {
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  register(envModels('ANTHROPIC', ['claude-sonnet-5', 'claude-haiku-4-5']), 'Anthropic', (id) => anthropic(id));
}

if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  register(envModels('GOOGLE', ['gemini-2.5-pro', 'gemini-2.5-flash']), 'Google', (id) => google(id));
}

if (process.env.DEEPSEEK_API_KEY) {
  const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
  register(envModels('DEEPSEEK', ['deepseek-chat', 'deepseek-reasoner']), 'DeepSeek', (id) => deepseek(id), { vision: false });
}

if (process.env.OPENROUTER_API_KEY) {
  // Gateway to 300+ models — put any "vendor/model" slugs in OPENROUTER_MODELS
  const openrouter = createOpenAICompatible({
    name: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
  register(envModels('OPENROUTER', ['openrouter/auto']), 'OpenRouter', (id) => openrouter(id));
}

if (process.env.OLLAMA_MODELS) {
  // Local models, fully offline — e.g. OLLAMA_MODELS="qwen3:8b,llama3.2"
  const ollama = createOpenAICompatible({
    name: 'ollama', apiKey: 'ollama',
    baseURL: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434') + '/v1',
  });
  register(envModels('OLLAMA', []), 'Ollama', (id) => ollama(id), { vision: false });
}

if (Object.keys(modelRegistry).length === 0) {
  console.error(
    '\n✗ No LLM API key found. 未找到任何 LLM API key。\n' +
    '  请执行 cp .env.example .env，然后至少填入一把 key：\n' +
    '    ZHIPU_API_KEY     — 智谱 GLM（免费，推荐）https://open.bigmodel.cn/\n' +
    '    DASHSCOPE_API_KEY — 通义千问 / OPENAI_API_KEY / ANTHROPIC_API_KEY /\n' +
    '    GOOGLE_API_KEY / DEEPSEEK_API_KEY / OPENROUTER_API_KEY / OLLAMA_MODELS\n'
  );
  process.exit(1);
}

const DEFAULT_MODEL = ZHIPU_KEY ? 'glm-4.5-flash' : Object.keys(modelRegistry)[0];

// Choose model entry: if images are attached and the model is text-only,
// switch to its provider's vision counterpart — or, failing that, any
// registered vision-capable model.
function resolveModel(modelId, hasImages) {
  const entry = modelRegistry[modelId] || modelRegistry[DEFAULT_MODEL];
  if (hasImages && !entry.vision) {
    if (entry.visionFallback && modelRegistry[entry.visionFallback]) {
      return modelRegistry[entry.visionFallback];
    }
    const anyVision = Object.values(modelRegistry).find((m) => m.vision);
    if (anyVision) return anyVision;
  }
  return entry;
}

// Convert our wire format ({role, content}[] + images[]) to AI SDK inputs.
// System messages are lifted into the top-level `system` option (AI SDK v7
// rejects system roles inside `messages`); images attach to the last user
// message, like the previous pi-ai bridge.
function toSdkPrompt(messages, images) {
  const systemParts = [];
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    const isLastUser = i === messages.length - 1 && m.role === 'user';
    if (isLastUser && images && images.length > 0) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...images.map((img) => ({ type: 'image', image: img.data, mediaType: img.mimeType || 'image/png' })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return { system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined, messages: out };
}

// ─── Web search tool (Zhipu Web Search API, ¥0.01/query) ───────
// Registered as an AI SDK tool: the MODEL decides when to search.

async function zhipuWebSearch(query, count = 5) {
  const r = await fetch('https://open.bigmodel.cn/api/paas/v4/web_search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ZHIPU_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_engine: 'search_std', search_query: query, count }),
  });
  if (!r.ok) throw new Error(`web_search HTTP ${r.status}`);
  const data = await r.json();
  return (data.search_result || []).map((s) => ({
    title: s.title || s.link,
    url: s.link,
    content: (s.content || '').slice(0, 600),
    media: s.media || undefined,
    date: s.publish_date || undefined,
  }));
}

// ─── Scholarly search (free open APIs, no keys) ─────────────────

// arXiv Atom API — regex-parse the stable entry fields (no XML dep needed)
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

// Semantic Scholar Graph API — free tier, no key (rate-limited but ample)
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

// Build the tools map for one request. `sources` accumulates every result
// so the route can stream them back to the client; numbering is global
// across all tools within the same generation. The MODEL decides which
// tool to call and when; `prefs` lets the user hide whole tool groups.
function makeTools(sources, onSearch, prefs = {}) {
  const pushNumbered = (results) => {
    const start = sources.length;
    sources.push(...results);
    if (results.length === 0) return 'No results found.';
    return results
      .map((r, i) =>
        `[${start + i + 1}] ${r.title}${r.authors ? ` — ${r.authors}` : ''}${r.date ? ` (${r.date})` : ''}\n${r.url ?? ''}\n${r.content}`)
      .join('\n\n');
  };
  const tools = {};

  if (prefs.web !== false && ZHIPU_KEY) {
    tools.web_search = tool({
      description:
        'Search the web for current events, specific facts, or anything you are not certain about. ' +
        'Results are numbered [1], [2], ... — when you use information from a result, cite it inline as [n]. ' +
        'Do not search for things you already know well. At most 3 searches per answer.',
      inputSchema: z.object({
        query: z.string().describe('The search query, in the language most likely to find good results'),
      }),
      execute: async ({ query }) => {
        onSearch?.('web_search', query);
        try { return pushNumbered(await zhipuWebSearch(query)); }
        catch (e) { return `Search failed (${e.message}) — try a different tool or answer from your knowledge.`; }
      },
    });
  }

  if (prefs.scholar !== false) {
    tools.arxiv_search = tool({
      description:
        'Search arXiv for academic papers and preprints (physics, math, CS, ML, stats…). ' +
        'Use when the user asks about papers, methods, or research literature. Returns title, authors, abstract, and link, numbered for [n] citations.',
      inputSchema: z.object({
        query: z.string().describe('Search terms — paper title, topic, method, or author. English works best on arXiv.'),
      }),
      execute: async ({ query }) => {
        onSearch?.('arxiv_search', query);
        try { return pushNumbered(await arxivSearch(query)); }
        catch (e) { return `arXiv search failed (${e.message}) — try semantic_scholar or answer from your knowledge.`; }
      },
    });
    tools.semantic_scholar = tool({
      description:
        'Search Semantic Scholar across all scholarly fields — includes citation counts, useful for judging impact and finding published (peer-reviewed) work beyond preprints. Numbered for [n] citations.',
      inputSchema: z.object({
        query: z.string().describe('Search terms — topic, title, or author, in English'),
      }),
      execute: async ({ query }) => {
        onSearch?.('semantic_scholar', query);
        try { return pushNumbered(await semanticScholarSearch(query)); }
        catch (e) { return `Semantic Scholar search failed (${e.message}) — try arxiv_search or answer from your knowledge.`; }
      },
    });
  }

  return Object.keys(tools).length > 0 ? tools : undefined;
}

// ─── Express App ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support image uploads

// PDF text extraction (pdfjs-dist) + page rendering (pdftoppm/poppler)
app.post('/api/pdf-extract', async (req, res) => {
  try {
    const { base64, renderImages = true, dpi = 150 } = req.body;
    if (!base64) return res.status(400).json({ error: 'Missing base64 field' });
    const buffer = Buffer.from(base64, 'base64');
    console.log(`PDF extract: ${buffer.length} bytes, header: ${buffer.slice(0, 5).toString()}`);

    // Save to temp file for pdftoppm
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');
    fs.writeFileSync(pdfPath, buffer);

    // 1. Extract text via pdfjs-dist
    let text = '';
    let numPages = 0;
    try {
      const uint8 = new Uint8Array(buffer);
      const doc = await getDocument({ data: uint8, verbosity: 0 }).promise;
      numPages = doc.numPages;
      const pageTexts = [];
      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map(item => item.str).join(' '));
        } catch { pageTexts.push(''); }
      }
      text = pageTexts.join('\n\n');
    } catch (textErr) {
      console.warn('pdfjs text extraction failed:', textErr.message);
    }

    // 2. Render pages as images via pdftoppm (poppler) — much better quality
    const pageImages = [];
    if (renderImages && POPPLER_AVAILABLE) {
      try {
        const outPrefix = path.join(tmpDir, 'page');
        execSync(`pdftoppm -png -r ${dpi} "${pdfPath}" "${outPrefix}"`, { timeout: 60000 });
        const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('page-') && f.endsWith('.png')).sort();
        for (const f of files) {
          const imgBuf = fs.readFileSync(path.join(tmpDir, f));
          pageImages.push(imgBuf.toString('base64'));
        }
      } catch (renderErr) {
        console.warn('pdftoppm rendering failed:', renderErr.message);
      }
    }

    // Cleanup temp files
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

    console.log(`PDF done: ${numPages} pages, ${text.length} chars, ${pageImages.length} images`);
    res.json({
      text,
      numPages,
      images: pageImages.length > 0 ? pageImages : undefined,
      imagesUnavailable: !POPPLER_AVAILABLE || undefined,
    });
  } catch (err) {
    console.error('PDF extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List available models
app.get('/api/models', (req, res) => {
  const models = Object.entries(modelRegistry).map(([id, m]) => ({
    id,
    name: m.name,
    provider: m.provider,
    vision: m.vision,
  }));
  res.json({ models, default: DEFAULT_MODEL });
});

// Non-streaming endpoint (background summaries)
app.post('/api/claude', async (req, res) => {
  const { messages, model: modelId, images } = req.body;
  const entry = resolveModel(modelId || DEFAULT_MODEL, images && images.length > 0);

  try {
    const prompt = toSdkPrompt(messages, images);
    const { text, usage } = await generateText({
      model: entry.model(),
      system: prompt.system,
      messages: prompt.messages,
      providerOptions: entry.providerOptions,
    });
    res.json({ text, usage });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SSE streaming endpoint. The model decides on its own which tools to use
// and when; `webSearch: false` / `scholarSearch: false` hide tool groups.
app.post('/api/stream', async (req, res) => {
  const { messages, model: modelId, images, webSearch, scholarSearch } = req.body;
  const entry = resolveModel(modelId || DEFAULT_MODEL, images && images.length > 0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sources = [];
  // Tracks how much prose has streamed out since the LAST tool call — the
  // synthesis-fallback trigger. (An opening line before the first search
  // must not count as "the answer".)
  let emittedChars = 0;
  let charsAtLastSearch = 0;

  const tools = makeTools(
    sources,
    (name, query) => {
      charsAtLastSearch = emittedChars;
      // Progress ping so the UI can show what's being searched
      res.write(`data: ${JSON.stringify({ tool: { name, query } })}\n\n`);
    },
    { web: webSearch !== false, scholar: scholarSearch !== false }
  );

  const prompt = toSdkPrompt(messages, images);
  if (tools) {
    // Make sure the model always synthesizes after searching, with citation
    // numbers that match THIS answer's search results (earlier messages in
    // the thread may contain their own [n] citations — those must not
    // continue the numbering).
    const directive = [
      'After using any search tool, you MUST follow up with a complete answer that SYNTHESIZES the results in your own words — analyze and conclude, never just list the results.',
      'Cite sources inline as [n], using EXACTLY the bracket numbers shown in this turn\'s search results (they always start at [1]). Ignore any citation numbers appearing in earlier conversation messages — they refer to different sources.',
      'If the search results are not actually relevant to the question, say so explicitly and answer from your own knowledge instead of forcing citations.',
      'Never end your turn immediately after a search.',
    ].join(' ');
    prompt.system = prompt.system ? `${prompt.system}\n\n${directive}` : directive;
  }

  try {
    const result = streamText({
      model: entry.model(),
      system: prompt.system,
      messages: prompt.messages,
      providerOptions: entry.providerOptions,
      tools,
      stopWhen: stepCountIs(5),
      // Force a synthesis step: from step 4 on, tools are disabled AND the
      // instructions switch to "write the final answer now" — GLM otherwise
      // keeps trying to search and leaks raw <tool_call> text into the answer.
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

    // GLM occasionally leaks raw "<tool_call>...</tool_call>" markup into the
    // text stream (e.g. when it wants to search but tools are disabled).
    // Filter it out, holding back a possible partial tag at the chunk tail.
    let holdback = '';
    const emitFiltered = (chunk) => {
      let buf = holdback + chunk;
      holdback = '';
      buf = buf.replace(/<tool_call>[\s\S]*?<\/tool_call>\n?/g, '');
      const open = buf.search(/<tool_call/);
      if (open !== -1) {
        holdback = buf.slice(open);
        buf = buf.slice(0, open);
      } else {
        // hold a tail that could be the start of "<tool_call>"
        for (let k = Math.min(buf.length, 10); k > 0; k--) {
          if ('<tool_call'.startsWith(buf.slice(-k))) {
            holdback = buf.slice(-k);
            buf = buf.slice(0, -k);
            break;
          }
        }
      }
      if (buf) {
        emittedChars += buf.length;
        res.write(`data: ${JSON.stringify({ text: buf })}\n\n`);
      }
    };

    for await (const delta of result.textStream) {
      emitFiltered(delta);
    }
    if (holdback && !holdback.startsWith('<tool_call')) {
      emittedChars += holdback.length;
      res.write(`data: ${JSON.stringify({ text: holdback })}\n\n`);
    }

    // Deterministic synthesis fallback: if the model searched but wrote
    // almost nothing AFTER its last search (an opening "I'll look that up"
    // before the search doesn't count), run one tool-free pass that can
    // only answer.
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
      for await (const delta of synth.textStream) {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      }
    }

    if (sources.length > 0) {
      res.write(`data: ${JSON.stringify({ sources })}\n\n`);
    }

    const usage = await result.totalUsage;
    if (usage) {
      res.write(`data: ${JSON.stringify({ usage })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'LLM request failed' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`ThoughtDAG proxy (Vercel AI SDK) running on http://localhost:${PORT}`);
  console.log(`Models: ${Object.keys(modelRegistry).join(', ')}`);
});
