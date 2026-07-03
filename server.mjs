import express from 'express';
import cors from 'cors';
import { stream, complete, getProviders, getModels } from '@mariozechner/pi-ai';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
// pdf-parse removed - using pdfjs-dist for both text and image extraction

// ─── Model Configuration ────────────────────────────────────────
// Default: Qwen Plus via DashScope (OpenAI-compatible)
const QWEN_KEY = 'REDACTED_REVOKED_KEY';

const qwenModel = {
  id: 'qwen-plus',
  name: 'Qwen Plus (DashScope)',
  api: 'openai-completions',
  provider: 'dashscope',
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0.8, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131072,
  maxTokens: 8192,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStrictMode: false,
    maxTokensField: 'max_tokens',
  },
};

const qwenVLModel = {
  id: 'qwen-vl-plus',
  name: 'Qwen VL Plus (DashScope)',
  api: 'openai-completions',
  provider: 'dashscope',
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 1.5, output: 4, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131072,
  maxTokens: 8192,
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    supportsStrictMode: false,
    maxTokensField: 'max_tokens',
  },
};

// Model registry — add more models here
const modelRegistry = {
  'qwen-plus': qwenModel,
  'qwen-vl-plus': qwenVLModel,
};

const DEFAULT_MODEL = 'qwen-plus';

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

// Choose model: if images present, use vision model
function resolveModel(modelId, hasImages) {
  if (hasImages && modelId === 'qwen-plus') {
    return modelRegistry['qwen-vl-plus'];
  }
  return modelRegistry[modelId] || modelRegistry[DEFAULT_MODEL];
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
    if (renderImages) {
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
    res.json({ text, numPages, images: pageImages.length > 0 ? pageImages : undefined });
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
    const response = await complete(model, context, { apiKey: QWEN_KEY });
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
    const s = stream(model, context, { apiKey: QWEN_KEY });

    for await (const event of s) {
      switch (event.type) {
        case 'text_delta':
          res.write(`data: ${JSON.stringify({ text: event.delta })}\n\n`);
          break;
        case 'toolcall_start':
          res.write(`data: ${JSON.stringify({ tool: 'start', name: event.partial.content[event.contentIndex]?.name })}\n\n`);
          break;
        case 'toolcall_end':
          res.write(`data: ${JSON.stringify({ tool: 'end', name: event.toolCall.name, args: event.toolCall.arguments })}\n\n`);
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

app.listen(3001, () => {
  console.log('ThoughtDAG proxy (pi-ai) running on http://localhost:3001');
  console.log(`Models: ${Object.keys(modelRegistry).join(', ')}`);
});
