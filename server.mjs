import express from 'express';
import cors from 'cors';
import { stream, complete, getProviders, getModels } from '@mariozechner/pi-ai';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
// pdf-parse removed - using pdfjs-dist for both text and image extraction

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

// ─── Model Configuration ────────────────────────────────────────
// Providers register their models only when the matching API key is present.
// Every model is OpenAI-compatible via pi-ai; each entry carries its own
// apiKey, and text models name a visionFallback used when images are attached.

const OPENAI_COMPAT = {
  api: 'openai-completions',
  reasoning: false,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStrictMode: false,
    maxTokensField: 'max_tokens',
  },
};

const ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// Model registry — add more providers/models here
const modelRegistry = {};

if (ZHIPU_KEY) {
  modelRegistry['glm-4.5-flash'] = {
    ...OPENAI_COMPAT,
    id: 'glm-4.5-flash',
    name: 'GLM-4.5 Flash (Zhipu, free)',
    provider: 'zhipu',
    baseUrl: ZHIPU_BASE,
    apiKey: ZHIPU_KEY,
    input: ['text'],
    visionFallback: 'glm-4v-flash',
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  };
  modelRegistry['glm-4v-flash'] = {
    ...OPENAI_COMPAT,
    id: 'glm-4v-flash',
    name: 'GLM-4V Flash (Zhipu, free vision)',
    provider: 'zhipu',
    baseUrl: ZHIPU_BASE,
    apiKey: ZHIPU_KEY,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 4096,
  };
}

if (QWEN_KEY) {
  modelRegistry['qwen-plus'] = {
    ...OPENAI_COMPAT,
    id: 'qwen-plus',
    name: 'Qwen Plus (DashScope)',
    provider: 'dashscope',
    baseUrl: DASHSCOPE_BASE,
    apiKey: QWEN_KEY,
    input: ['text'],
    visionFallback: 'qwen-vl-plus',
    cost: { input: 0.8, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  };
  modelRegistry['qwen-vl-plus'] = {
    ...OPENAI_COMPAT,
    id: 'qwen-vl-plus',
    name: 'Qwen VL Plus (DashScope)',
    provider: 'dashscope',
    baseUrl: DASHSCOPE_BASE,
    apiKey: QWEN_KEY,
    input: ['text', 'image'],
    cost: { input: 1.5, output: 4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  };
}

const DEFAULT_MODEL = ZHIPU_KEY ? 'glm-4.5-flash' : 'qwen-plus';

// ─── Helpers ────────────────────────────────────────────────────

// Convert our simple message format to pi-ai Context
function buildPiContext(messages, images) {
  let systemPrompt = undefined;
  const piMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
      continue;
    }

    // Check if this is the last user message and has images
    const isLastUser = msg === messages[messages.length - 1] && msg.role === 'user';

    if (isLastUser && images && images.length > 0) {
      // Multimodal: text + images
      const content = [
        { type: 'text', text: msg.content },
        ...images.map((img) => ({
          type: 'image',
          data: img.data, // base64
          mimeType: img.mimeType || 'image/png',
        })),
      ];
      piMessages.push({ role: 'user', content });
    } else {
      // pi-ai expects content as array of content blocks for all messages
      piMessages.push({ role: msg.role, content: [{ type: 'text', text: msg.content }] });
    }
  }

  return { systemPrompt, messages: piMessages };
}

// Choose model: if images are attached and the model is text-only,
// switch to its provider's vision counterpart.
function resolveModel(modelId, hasImages) {
  const model = modelRegistry[modelId] || modelRegistry[DEFAULT_MODEL];
  if (hasImages && !model.input.includes('image') && model.visionFallback && modelRegistry[model.visionFallback]) {
    return modelRegistry[model.visionFallback];
  }
  return model;
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
        // pdftoppm outputs page-01.png, page-02.png, etc.
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
    vision: m.input.includes('image'),
    reasoning: m.reasoning,
  }));
  res.json({ models, default: DEFAULT_MODEL });
});

// Non-streaming endpoint
app.post('/api/claude', async (req, res) => {
  const { messages, model: modelId, images } = req.body;
  const hasImages = images && images.length > 0;
  const model = resolveModel(modelId || DEFAULT_MODEL, hasImages);
  const context = buildPiContext(messages, images);

  try {
    const response = await complete(model, context, { apiKey: model.apiKey });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    res.json({
      text,
      usage: response.usage,
    });
  } catch (err) {
    console.error('Complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SSE streaming endpoint
app.post('/api/stream', async (req, res) => {
  const { messages, model: modelId, images } = req.body;
  const hasImages = images && images.length > 0;
  const model = resolveModel(modelId || DEFAULT_MODEL, hasImages);
  const context = buildPiContext(messages, images);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  try {
    const s = stream(model, context, { apiKey: model.apiKey });

    for await (const event of s) {
      switch (event.type) {
        case 'text_delta':
          res.write(`data: ${JSON.stringify({ text: event.delta })}\n\n`);
          break;
        case 'error':
          res.write(`data: ${JSON.stringify({ error: event.error?.errorMessage || 'Unknown error' })}\n\n`);
          break;
        case 'done':
          // Send usage info before DONE
          const result = await s.result();
          if (result.usage) {
            res.write(`data: ${JSON.stringify({ usage: result.usage })}\n\n`);
          }
          break;
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`ThoughtDAG proxy (pi-ai) running on http://localhost:${PORT}`);
  console.log(`Models: ${Object.keys(modelRegistry).join(', ')}`);
});
