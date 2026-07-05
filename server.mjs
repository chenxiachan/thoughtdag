import express from 'express';
import cors from 'cors';
import { streamText, generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
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

if (!ZHIPU_KEY && !QWEN_KEY) {
  console.error(
    '\n✗ No LLM API key found. 未找到任何 LLM API key。\n' +
    '  请执行 cp .env.example .env，然后至少填入一把 key：\n' +
    '    ZHIPU_API_KEY     — 智谱 GLM（免费，推荐）https://open.bigmodel.cn/\n' +
    '    DASHSCOPE_API_KEY — 通义千问 https://dashscope.console.aliyun.com/\n'
  );
  process.exit(1);
}

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
// Providers register only when the matching API key is present. Adding
// another backend (Anthropic/DeepSeek/Ollama/...) is one createXxx() call.

const zhipu = ZHIPU_KEY
  ? createZhipu({ apiKey: ZHIPU_KEY, baseURL: 'https://open.bigmodel.cn/api/paas/v4' })
  : null;
const qwen = QWEN_KEY
  ? createOpenAICompatible({
      name: 'dashscope',
      apiKey: QWEN_KEY,
      baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    })
  : null;

// id → { name, vision, visionFallback?, model(), providerOptions? }
const modelRegistry = {};

if (zhipu) {
  modelRegistry['glm-4.5-flash'] = {
    name: 'GLM-4.5 Flash (Zhipu, free)',
    vision: false,
    visionFallback: 'glm-4v-flash',
    model: () => zhipu('glm-4.5-flash'),
    // GLM-4.5 defaults to hidden "thinking" — disable for fast first tokens
    providerOptions: { zhipu: { thinking: { type: 'disabled' } } },
  };
  modelRegistry['glm-4v-flash'] = {
    name: 'GLM-4V Flash (Zhipu, free vision)',
    vision: true,
    model: () => zhipu('glm-4v-flash'),
  };
}

if (qwen) {
  modelRegistry['qwen-plus'] = {
    name: 'Qwen Plus (DashScope)',
    vision: false,
    visionFallback: 'qwen-vl-plus',
    model: () => qwen('qwen-plus'),
  };
  modelRegistry['qwen-vl-plus'] = {
    name: 'Qwen VL Plus (DashScope)',
    vision: true,
    model: () => qwen('qwen-vl-plus'),
  };
}

const DEFAULT_MODEL = ZHIPU_KEY ? 'glm-4.5-flash' : 'qwen-plus';

// Choose model entry: if images are attached and the model is text-only,
// switch to its provider's vision counterpart.
function resolveModel(modelId, hasImages) {
  const entry = modelRegistry[modelId] || modelRegistry[DEFAULT_MODEL];
  if (hasImages && !entry.vision && entry.visionFallback && modelRegistry[entry.visionFallback]) {
    return modelRegistry[entry.visionFallback];
  }
  return entry;
}

// Convert our wire format ({role, content}[] + images[]) to AI SDK messages —
// images attach to the last user message, like the previous pi-ai bridge.
function toSdkMessages(messages, images) {
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
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
  return out;
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

// Build the tools map for one request. `sources` accumulates every result
// so the route can stream them back to the client; numbering is global
// across multiple searches within the same generation.
function makeSearchTools(sources, onSearch) {
  if (!ZHIPU_KEY) return undefined;
  return {
    web_search: tool({
      description:
        'Search the web for current events, specific facts, papers, or anything you are not certain about. ' +
        'Results are numbered [1], [2], ... — when you use information from a result, cite it inline as [n]. ' +
        'Do not search for things you already know well.',
      inputSchema: z.object({
        query: z.string().describe('The search query, in the language most likely to find good results'),
      }),
      execute: async ({ query }) => {
        onSearch?.(query);
        const results = await zhipuWebSearch(query);
        const start = sources.length;
        sources.push(...results);
        if (results.length === 0) return 'No results found.';
        return results
          .map((r, i) => `[${start + i + 1}] ${r.title}${r.date ? ` (${r.date})` : ''}\n${r.url}\n${r.content}`)
          .join('\n\n');
      },
    }),
  };
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
    vision: m.vision,
    reasoning: false,
  }));
  res.json({ models, default: DEFAULT_MODEL });
});

// Non-streaming endpoint (background summaries)
app.post('/api/claude', async (req, res) => {
  const { messages, model: modelId, images } = req.body;
  const entry = resolveModel(modelId || DEFAULT_MODEL, images && images.length > 0);

  try {
    const { text, usage } = await generateText({
      model: entry.model(),
      messages: toSdkMessages(messages, images),
      providerOptions: entry.providerOptions,
    });
    res.json({ text, usage });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SSE streaming endpoint. `webSearch: false` disables the tool; otherwise
// the model decides on its own whether (and how often) to search.
app.post('/api/stream', async (req, res) => {
  const { messages, model: modelId, images, webSearch } = req.body;
  const entry = resolveModel(modelId || DEFAULT_MODEL, images && images.length > 0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sources = [];
  const tools = webSearch !== false
    ? makeSearchTools(sources, (query) => {
        // Progress ping so the UI can show what's being searched
        res.write(`data: ${JSON.stringify({ tool: { name: 'web_search', query } })}\n\n`);
      })
    : undefined;

  try {
    const result = streamText({
      model: entry.model(),
      messages: toSdkMessages(messages, images),
      providerOptions: entry.providerOptions,
      tools,
      stopWhen: stepCountIs(5),
    });

    for await (const delta of result.textStream) {
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
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
