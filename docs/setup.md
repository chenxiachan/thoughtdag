# Setup & architecture

[中文](./setup_ZH.md) · [Back to README](../README.md)

## Quick start (in detail)

The fastest path is the [live demo](https://app.thoughtdag.workers.dev): open, paste a key (or don't, and browse the example canvas), go. Model traffic runs browser-direct to the gateway, so your key never touches the demo's server. To run it yourself:

```bash
npm install
npm run server         # LLM proxy
npm run dev            # → http://localhost:5173
```

No config needed to start: if `.env` has no key, the app asks you to connect a model interface. Pick a provider and paste a key, hook up a locally running model (Ollama and friends), or point it at any custom OpenAI-compatible endpoint; the model list is fetched live from the endpoint, and keys stay in localStorage and the proxy's memory, never on disk. Or copy `.env.example` to `.env` and fill in any provider key; `ZHIPU_API_KEY` is free (open.bigmodel.cn). Outside China, pick the **Z.ai GLM** preset inside the app: the international twin of Zhipu, with the same free flash models and no CN phone number required (z.ai). OpenRouter also works as a one-key gateway with free-tier models. Note: consumer subscriptions (ChatGPT Plus, Claude Pro, Gemini Advanced) do not include API access; every provider sells API keys separately.

The first launch opens a seeded example canvas: four chapters around one everyday question (why saved articles stay unread), from the conversation grammar to a real embedded PDF with its reading loop. Zoom out and you get the map view shown in the README. The fastest way in: drop a PDF on the landing page and start reading. The Zhipu key also powers web search (engine tiers switchable in the model menu); scholarly search (arXiv + Semantic Scholar) is free and needs no key at all.

## Supported models

Built on the Vercel AI SDK. Any provider below activates when its key lands in `.env`; or skip `.env` entirely and connect any OpenAI-compatible interface in the app (a local Ollama included). A toolbar picker switches models at any time, and text-only models reroute automatically when images appear. Default model IDs can be overridden per provider (e.g. `OPENAI_MODELS=gpt-5.2`).

> Image understanding needs a vision key. Pasted images are auto-read once, by the strongest vision model you have configured, into editable companion text. The free `glm-4v-flash` works; flagship models read scientific figures noticeably better.

| Provider | Default models | `.env` key | Notes |
|----------|----------------|------------|-------|
| **Zhipu GLM** | glm-4.5-flash · glm-4v-flash | `ZHIPU_API_KEY` | **Free**, CN-direct; powers web search. Intl: use the in-app Z.ai preset |
| **Qwen** (DashScope) | qwen-plus · qwen-vl-plus | `DASHSCOPE_API_KEY` | CN-direct |
| **OpenAI** | gpt-5.1 · gpt-5-mini | `OPENAI_API_KEY` | override via `OPENAI_MODELS` |
| **Anthropic** | claude-sonnet-5 · claude-haiku-4-5 | `ANTHROPIC_API_KEY` | override via `ANTHROPIC_MODELS` |
| **Google** | gemini-2.5-pro · gemini-2.5-flash | `GOOGLE_API_KEY` | override via `GOOGLE_MODELS` |
| **DeepSeek** | deepseek-v4-flash · deepseek-v4-pro | `DEEPSEEK_API_KEY` | text-only (auto vision reroute) |
| **Kimi** (Moonshot) | kimi-k2-turbo-preview · kimi-latest | `MOONSHOT_API_KEY` | CN-direct; intl via `MOONSHOT_BASE_URL` |
| **OpenRouter** | openrouter/auto | `OPENROUTER_API_KEY` | gateway to 300+ models; list any `vendor/model` slugs in `OPENROUTER_MODELS` |
| **Ollama** | (yours) | `OLLAMA_MODELS=qwen3:8b,…` | fully local & offline |

> **Web search availability**: OpenRouter interfaces have it built in (the gateway's `:online` variant). Any other interface gets it when a GLM interface (Zhipu or Z.ai, a free key works) is also connected — that key powers the search engine for every model. Scholarly search (arXiv + Semantic Scholar) needs nothing.

## Cost & privacy (in detail)

- **Free to run.** The Zhipu free tier (GLM-4.5-Flash text + GLM-4V-Flash vision) covers every feature; agentic web search costs ~¥0.01/query. International users get the same free flash models through the in-app Z.ai GLM preset (z.ai). Or point it at any provider you already pay for, or a local Ollama model, fully offline.
- **Your data stays with you.** Canvases live in your browser's storage; the only server is a thin proxy on your own machine. Nothing is uploaded anywhere except the LLM API you chose. On the hosted demo, model traffic runs browser-direct to the gateway, so keys and conversations never pass through the demo's server at all.
- **Your PDFs stay local.** Dropped documents never leave your machine as files; only the extracted text travels, to the model API you picked, when you ask about them. Unpublished manuscripts are safe to read here.
- **Losing the browser is not losing the work.** The automatic folder backup writes real `.thoughtdag.json` files to a folder you choose (Chromium browsers — Chrome, Edge, Arc; on Safari/Firefox use the one-click manual export). Backup format stays backward compatible, and Markdown export is the format-free escape hatch either way.
- Optional: PDF page rendering wants poppler (`brew install poppler`); degrades gracefully to text without it.

## Tech stack & architecture

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript + Vite 7 |
| Canvas | @xyflow/react (React Flow) |
| State | Zustand (persist → IndexedDB via idb-keyval) |
| Styling | Tailwind CSS v4 |
| LLM | Vercel AI SDK: 9 provider families, auto-registered from `.env` keys |
| Proxy | Express + Vercel AI SDK (server.mjs, default port 3001) |

<details>
<summary>Request flow</summary>

```
Browser (localhost:5173)
  └─ React + React Flow canvas
      └─ Zustand store (nodes, edges, history) ⇄ IndexedDB (auto-save)
          ├─ buildContext(nodeId) → walk DAG → ContextMessage[] + images
          └─ src/lib/api.ts
              ├─ llmCallStream(messages) → POST /api/stream (SSE + tool events)
              ├─ llmCall(messages)       → POST /api/claude (non-streaming, summaries)
              └─ extractPdf(base64)      → POST /api/pdf-extract
                        └─ Express + AI SDK (server.mjs) → Zhipu / Qwen / any provider
                             └─ web_search tool (model-invoked, citations flow back)
```

</details>
