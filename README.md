<div align="center">

<img src="public/favicon.svg" width="88" alt="ThoughtDAG logo"/>

# ThoughtDAG

**Your thinking deserves a map.**

An infinite canvas where LLM conversations grow into an editable thought graph.
*Built for people who read papers for a living.*

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072)
![License](https://img.shields.io/badge/license-MIT-green) ![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

**[▶ Try it live](https://thoughtdag.xia-chen.workers.dev)** · [🎬 See it work in 30s](#delete-one-edge-get-a-different-answer). No install, no signup. Load the example canvas from the landing page to see the map above, live. No API key yet? Two free routes: [Zhipu](https://open.bigmodel.cn) ships a free tier (CN, phone signup), [OpenRouter](https://openrouter.ai) has free community models (international, Google login) — paste either into the demo's model manager.

[中文](./README_ZH.md) · [Live demo](https://thoughtdag.xia-chen.workers.dev) · [Quick start](#quick-start) · [Features](#features-at-a-glance) · [Models](#supported-models) · [Roadmap](#roadmap)

<img src="docs/hero-en.png" alt="ThoughtDAG: a waterfall DAG of thought: the question enters at the top center, forks into a decision (left) and a ruled-out branch (right), flows through a pivot and a reviewer on a dashed watch edge, and exits through a centered open question; every plaque badged by cognitive move. The focus panel on the right shows the decision node's full deepseek-v4-pro answer under an inherited Cognitive-science-coach role, with attachments, highlights and the token-priced context chain" width="100%"/>

</div>

## Why

Chat is linear and opaque: context dilutes as the thread grows, nothing can be removed, and you never see what the model actually reads. ThoughtDAG lays the conversation out as a graph. Every question is a node, every wire is context, and editing the graph edits the model's memory. Think in branches, not threads.

## Quick start

The fastest path is the [live demo](https://thoughtdag.xia-chen.workers.dev): open, paste a key (or don't, and browse the example canvas), go. Model traffic runs browser-direct to the gateway, so your key never touches the demo's server. To run it yourself:

```bash
npm install
npm run server         # LLM proxy
npm run dev            # → http://localhost:5173
```

No config needed to start: if `.env` has no key, the app asks you to connect a model interface. Pick a provider and paste a key, hook up a locally running model (Ollama and friends), or point it at any custom OpenAI-compatible endpoint; the model list is fetched live from the endpoint, and keys stay in localStorage and the proxy's memory, never on disk. Or copy `.env.example` to `.env` and fill in any provider key; `ZHIPU_API_KEY` is free (open.bigmodel.cn).

The first launch opens a seeded example canvas: four chapters around one everyday question (why saved articles stay unread), from the conversation grammar to a real embedded PDF with its reading loop. Zoom out: the hero image above is that canvas as a map. The fastest way in: drop a PDF on the landing page and start reading. The Zhipu key also powers web search (engine tiers switchable in the model menu); scholarly search (arXiv + Semantic Scholar) is free and needs no key at all.

## Read a paper into a map

Drop in a PDF and read the original pages. Select a passage and ask: the answer streams in beside the document, and the question lands on the canvas wired to the material, page number included. The asked passage keeps a mark on the page: a highlight wash and a bubble that reopens the conversation, so everything you asked stays reachable while you read. The trip works both ways: back on the canvas, the node wears a p.N chip that jumps straight back to that page in the reader.

One click writes a guided digest: a short structured post in your language, every point anchored to its page with jump buttons. The digest is itself a node: wire it downstream and later questions ride the material's best compression instead of its full text. Scanned documents rewrite into readable Markdown (formulas included) in one click.

<img src="docs/reading-en.gif" alt="Screen recording: selecting a sentence on the original PDF page, asking about it, the answer streaming into the annotation rail while the passage keeps a bubble mark, then a guided digest with page jumps" width="100%"/>

**The core gesture, everywhere:** select text, hit Explore, and a branch grows from exactly that passage — in the reader, in any answer, on any card. The new node inherits only what you selected; the main chain stays clean.

## Delete one edge, get a different answer

The model sees exactly what wires into a node. That is the whole rule, and it makes the claim testable: keep the prompt identical, change one wire, and watch the answer change.

<img src="docs/prune-en.gif" alt="Screen recording: a summary node wired to both the research chain and an off-topic dinner node absorbs the noise; the noise edge is clicked, deleted, and regeneration returns a clean summary" width="100%"/>

*One summary node, two parents, and dinner plans leak into the answer. Delete the noise edge, regenerate, and the same prompt returns a clean summary. Recorded from the app (content preloaded so every run is inspectable); the mechanism is live behavior; reproduce it in chapter ③ of the example canvas.*

## Features at a glance

| | |
|---|---|
| 🧠 Context editing | Merge branches by drawing a wire, prune memory by deleting one, archive dead ends out of every future context |
| 📖 Reading loop | Asked passages keep marks on the PDF pages; canvas nodes jump back with p.N chips; one-click guided digest as a wireable node |
| ✨ Highlights | Select to mark what matters; one overview lists every mark (by time or by node, each pinpointing its source); weave any subset into one cited passage |
| 🗺️ Map view | Three semantic-zoom tiers: cards → takeaway plaques (✕ ruled out · ⚖ decided · ↩ pivoted · ? open) → an icon skeleton whose seals keep a fixed screen size, so the far view stays dense |
| 📤 Share read-only | One link turns the canvas into a read-only page anyone can walk; the link itself carries the graph, no account and no server storage involved |
| 🧭 Staleness & replay | Upstream edits mark the answers they invalidate; replay them in dependency order, token estimate first |
| 🧪 Paradigms | Reusable workflows of human and machine steps; change the input and replay the whole experiment |
| 🔌 Any model | Nine provider families, or connect any OpenAI-compatible endpoint in the app; switch per node, pins follow the line, fully local with Ollama |
| 🔒 Local-first | Data lives in your browser; automatic folder backup writes real files on disk (point it at a synced folder for zero-server cross-device); backups are plain JSON you own |

More below the fold: dashed references with priced quote ⇄ full conversion, converge with intent, live reviewers, topology check-up, agentic search, roles, @-mentions.

<details>
<summary><b>📜 Full feature list, by area</b></summary>

### Canvas & context: the One Rule family

- **DAG context engine**: `buildContext()` walks all incoming edges, builds history in topological order
- **Layered context assembly**: materials → reference blocks → the conversation, ordering independent of wiring history (same graph, same prompt)
- **Purple edges** (continue): inherit the full ancestor context
- **Orange solid edges** (explore): select text → branch right with the selection as context; solid always means structural, dashed always means bypass (reference / watch)
- **Reference edges (dashed)**: drop a hand-drawn wire on any node to quote it (Q&A + upstream question trail) without dragging its whole conversation in; depth is a first-class edge property: toggle quote ⇄ full on the selected edge OR in the panel's context tree, and the connect toast prices both options (silent when the source has no chain)
- **Context send preview**: live "~N tok · M messages · K files" plus a materials · references · conversation layer breakdown before asking
- **Click-to-delete edges**: select an edge for a floating delete button; right-click menu works too; Cmd+Z undoes
- **Archive (prune-but-keep)**: dimmed on canvas, excluded from every context walk, restorable; batch via multi-select
- **Merge Synthesis**: box-select nodes → structured synthesis (conclusions / evidence / open questions)
- **Highlight system**: three downstream modes: 📄 Full text / 🏷️ Tag important / ✂️ Highlights only; marks render across lists and tables; stale highlights auto-clean on edit; an all-highlights overview (by time / by node) pinpoints each mark's source node, exports Markdown, and weaves any checked subset into one cited passage
- **Node role system**: per-node system prompt with three modes (inherit / set for next / reset here), `appliedRole` recorded at generation time, radio picker for multi-parent conflicts
- **Role library, user-editable**: built-ins plus your own roles; add, edit and remove in a manager (editing a built-in makes your copy; restore anytime); applied roles stay frozen on their nodes
- **Token counting**: per-node usage display

### Reading & materials

- **Material reader**: original PDF rendering with a selectable text layer (pdf.js); select → ask lands a branch node with `(p.N)` provenance, and the passage keeps an anchor on the page (highlight wash + a bubble that reopens the thread); canvas nodes carry a p.N chip that jumps back into the reader; extracted-text view for scanned PDFs; a footer thread index tagging each conversation p.N or whole-material; per-material scroll memory
- **Annotation rail**: answers stream beside the document; follow-ups chain onto the thread; selecting inside a rail answer explores (branch of THAT answer) or highlights; thread chips switch conversations, a crosshair jumps to the canvas
- **Answers get the reading loop too**: every response opens reading-size; select to highlight or to branch from that passage, ask follow-ups below, and the viewer swaps to the new node so a whole chain of questions streams in place
- **Guided digest**: one click turns the material into a short structured post in the UI language, with (p.N) jump buttons back into the original pages; the digest is a canvas NODE (versioned on rewrite, model-stamped, wireable downstream as the material's compression); regenerating routes through the digest prompt against the full text
- **Recognize (scanned PDFs)**: per-page vision rewrite into Markdown/LaTeX, editable; external OCR output pastes in
- **Content nodes**: notes (markdown), file nodes with PDF covers, time-stamped link snapshots; paste-driven creation; image auto-reading picks the strongest configured vision model; every material opens in the reader
- **Attachment system**: node-local attachments (drag/paste/upload), inherited include/exclude control, fingerprint dedup, automatic Vision switching for images; PDFs feed context as extracted text and wear their first page as a cover on file nodes
- **Material-first landing**: drop a document on the landing page and it lands as a material node with the reader auto-opened; attachments to the root question stay behind the explicit paperclip

### Map & review

- **Map mode**: three tiers with hysteresis: full cards → takeaway plaques → glyph seals (one icon per node); seals and edges counter-scale to a fixed screen size (map-pin style), so zooming further out tightens the map instead of shrinking it; nodes awaiting human input keep their working form
- **Typed takeaways**: one conclusion-first line per answer version, auto-classified (✕ ruled out · ⚖ decided · ↩ pivoted · ? open; insight stays unmarked); display layer only, never enters context or fingerprints
- **Staleness tracking**: per-generation upstream fingerprints; amber badges on nodes, dots in the context tree, explicit [Stale] marks in downstream payloads
- **Batch replay**: one click re-runs every stale node in dependency order; confirm dialog with a token estimate; stop anytime
- **Version management**: regenerate in place appends a comparable version (page through, delete, revert; downstream staleness reacts to the active version); "Regenerate as branch" spawns a parallel sibling for A/B runs
- **Topology check-up**: on-demand diagnostics with deterministic findings (residual edges, shadow references, blind-pool breaches, pool asymmetry) plus observations (long chains, open branches, collider continuations); locate + one-click fix
- **Cmd+F node search**: filter by question/answer/summary, arrows + Enter to jump-pan the canvas
- **Ancestor edge highlighting**: the selected node's path to root turns gold, others dim

### Generation & automation

- **Streaming responses**: SSE token-by-token rendering with blinking cursor, in node and panel; Stop keeps partial content; failed generations show Retry (errors go to toasts, never into answers)
- **Reviewer preset**: critic role on a sliding red edge; re-critiques each new step automatically, history versioned; reviewers are ordinary nodes (question them, branch from them)
- **Paradigm mode**: human/prompt steps + material slots; instantiate → cascade → unlock; edit the input + replay = re-run the experiment; bounded reviewer rounds declared in the file
- **Ambient memory**: a background judge classifies durable facts (preference / identity / project) with admission rules in code, visible toast + undo on every write; project entries decay out of context after 45 days; one global switch (default on), manager with category badges, paste-import and JSON export; machine steps and digests stay memory-free
- **Edit everything**: double-click to edit questions or responses; text selection toolbar (Branch / Highlight)

### Models & search

- **Any model**: nine provider families register from `.env` keys; a toolbar picker switches at any time; text-only models reroute automatically when images appear
- **Model interface manager**: no `.env` needed; provider presets pin only the endpoint address, and the model list is fetched live from the endpoint's `/models` route (never goes stale); a local Ollama is detected keylessly; a custom-endpoint field catches every other OpenAI-compatible service; keys stay in localStorage + proxy memory, never on disk; the manager auto-opens when no model is configured
- **Per-node model override**: any node can pin its own LLM (badge on the card, sibling regenerations inherit it); cheap models for exploration, flagship for the hard steps; every version records which model wrote it
- **Agentic search**: AI SDK tool loop: web search + arXiv + Semantic Scholar (free APIs), `[n]` citations + persisted references, guaranteed synthesis fallback, per-group toolbar toggles
- **MCP tool ecosystem**: `mcp.config.json` (stdio + HTTP/SSE transports); tools join the agentic loop with per-call progress; mock server included for testing
- **Capabilities panel**: search engine choice, scholar status, vision model preference and memory switch in one place, at the model picker's foot

### Workbench & data

- **Infinite canvas**: pan, zoom, drag nodes freely (React Flow)
- **Column-Tree auto-layout**: main chain flows down, branches fork right; real measured heights prevent overlap; Tidy layout / Align selection on demand
- **Frames**: labeled colored regions with a navigator jump list; hide-annotations view toggle
- **Focus panel (floating overlay)**: cards-on-wash reading layout over the canvas (which never resizes), context tree grouped by materials / references / conversation, follow-up input; drag-resizable width
- **Markdown + LaTeX**: full markdown, syntax highlighting, inline and block math
- **Multi-select**: box-select nodes: Merge Summary / Merge & Delete / Align / Export / Delete
- **Data persistence**: IndexedDB auto-save (1s debounce), survives refresh; multi-canvas projects (create/switch/rename/delete)
- **Read-only share links**: one link carries the whole graph (compressed into the URL, no server storage); the viewer walks, zooms and reads but cannot edit; share from the ⋯ menu
- **@-mentions**: type @ in any ask box to reference a node by name; mentions not already upstream get a real dashed reference edge (visible, priced, convertible), upstream ones become precise designators
- **Automatic folder backup**: grant a folder once and every change debounces into a real `.thoughtdag.json` on disk; point it at a synced directory and it doubles as cross-device sync with zero servers; a toolbar control center shows the last write and backs up every canvas on demand
- **Event log**: an append-only record of semantic operations (asks, generations, highlights, archiving, undo) with timestamps, metadata-only; travels in backups, exports as CSV for R/Python analysis
- **Node context menu**: right-click for open panel / reading view / regenerate (in place or as a new node) / copy / duplicate / archive / delete; right-clicking selected text keeps the native menu
- **Export system**: whole-graph JSON backup and import; context-chain / multi-select Markdown export; memory and roles export too: easy in, easy out
- **Import ChatGPT / Claude exports**: drop conversations.json into Import; edit/regenerate branches are preserved as graph forks, each conversation becomes its own canvas
- **Undo/Redo**: Cmd+Z / Cmd+Shift+Z, full state snapshots
- **Keyboard shortcuts**: Space collapse, R regenerate, arrow keys walk the DAG, Esc steps out (legend in the tutorial)
- **Bilingual UI**: auto-detects browser language, one-click EN/中 switch
- **Built-in tutorial**: a ten-step illustrated hero page, from asking to paradigms
- **Example canvas on first run**: four framed chapters around one everyday question: conversation grammar, materials & references, the ⚖️ context-pruning pair, and a reading loop with a real embedded PDF (anchored question, digest node); every node carries a typed takeaway so zooming out lands on a working map; reload anytime from the landing screen

</details>

## Philosophy

Chat terminals are harnesses for doing: they optimize for handing you an answer and hide everything else. ThoughtDAG is an instrument for thinking: the unit of value is the reasoning structure itself, kept legible, editable and repeatable.

Mind maps are drawn; this map grows. Chat leaves no map at all.

*The graph has no cycles. The loop is you.*

## Cost & privacy

- **Free to run.** The Zhipu free tier (GLM-4.5-Flash text + GLM-4V-Flash vision) covers every feature; agentic web search costs ~¥0.01/query. Or point it at any provider you already pay for, or a local Ollama model, fully offline.
- **Your data stays with you.** Canvases live in your browser's storage; the only server is a thin proxy on your own machine. Nothing is uploaded anywhere except the LLM API you chose. On the hosted demo, model traffic runs browser-direct to the gateway, so keys and conversations never pass through the demo's server at all.
- **Your PDFs stay local.** Dropped documents never leave your machine as files; only the extracted text travels, to the model API you picked, when you ask about them. Unpublished manuscripts are safe to read here.
- **Losing the browser is not losing the work.** The automatic folder backup writes real `.thoughtdag.json` files to a folder you choose (Chromium browsers — Chrome, Edge, Arc; on Safari/Firefox use the one-click manual export). Backup format stays backward compatible, and Markdown export is the format-free escape hatch either way.
- Optional: PDF page rendering wants poppler (`brew install poppler`); degrades gracefully to text without it.

## Supported models

Built on the Vercel AI SDK. Any provider below activates when its key lands in `.env`; or skip `.env` entirely and connect any OpenAI-compatible interface in the app (a local Ollama included). A toolbar picker switches models at any time, and text-only models reroute automatically when images appear. Default model IDs can be overridden per provider (e.g. `OPENAI_MODELS=gpt-5.2`).

> Image understanding needs a vision key. Pasted images are auto-read once, by the strongest vision model you have configured, into editable companion text. The free `glm-4v-flash` works; flagship models read scientific figures noticeably better.

| Provider | Default models | `.env` key | Notes |
|----------|----------------|------------|-------|
| **Zhipu GLM** | glm-4.5-flash · glm-4v-flash | `ZHIPU_API_KEY` | **Free**, CN-direct; powers web search |
| **Qwen** (DashScope) | qwen-plus · qwen-vl-plus | `DASHSCOPE_API_KEY` | CN-direct |
| **OpenAI** | gpt-5.1 · gpt-5-mini | `OPENAI_API_KEY` | override via `OPENAI_MODELS` |
| **Anthropic** | claude-sonnet-5 · claude-haiku-4-5 | `ANTHROPIC_API_KEY` | override via `ANTHROPIC_MODELS` |
| **Google** | gemini-2.5-pro · gemini-2.5-flash | `GOOGLE_API_KEY` | override via `GOOGLE_MODELS` |
| **DeepSeek** | deepseek-v4-flash · deepseek-v4-pro | `DEEPSEEK_API_KEY` | text-only (auto vision reroute) |
| **Kimi** (Moonshot) | kimi-k2-turbo-preview · kimi-latest | `MOONSHOT_API_KEY` | CN-direct; intl via `MOONSHOT_BASE_URL` |
| **OpenRouter** | openrouter/auto | `OPENROUTER_API_KEY` | gateway to 300+ models; list any `vendor/model` slugs in `OPENROUTER_MODELS` |
| **Ollama** | (yours) | `OLLAMA_MODELS=qwen3:8b,…` | fully local & offline |

## Tech Stack & Architecture

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript + Vite 7 |
| Canvas | @xyflow/react (React Flow) |
| State | Zustand (persist → IndexedDB via idb-keyval) |
| Styling | Tailwind CSS v4 |
| LLM | Vercel AI SDK: 9 provider families, auto-registered from `.env` keys (see [Supported models](#supported-models)) |
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

## Roadmap

**Near term**
- [ ] Save any canvas as a paradigm (reverse instantiation)
- [ ] Attachment blob separation (scaling image-heavy canvases)

**Long term**
- [ ] Run comparison view (same paradigm, N runs side by side)
- [ ] Artifact nodes (file deliverables on canvas, Monaco editor + version history)
- [ ] Async collaboration: share a paradigm, collect runs

## How to cite

If ThoughtDAG plays a role in your research, please cite it (GitHub's "Cite this repository" button uses the bundled `CITATION.cff`):

```bibtex
@software{thoughtdag,
  author = {Chen, Xia},
  title  = {ThoughtDAG: an instrument for legible human-AI collaboration},
  url    = {https://github.com/chenxiachan/thoughtdag},
  year   = {2026},
  license = {MIT}
}
```

## Feedback

ThoughtDAG is built by a postdoc for his own daily literature work, and used every day; every feature here exists because real reading demanded it. It is an early, actively developed project, which is exactly when feedback matters most:

- ⭐ **Star the repo** if the idea resonates; it genuinely helps
- 🐛 Hit a bug or a rough edge? [Open an issue](https://github.com/chenxiachan/thoughtdag/issues)
- 💡 Ideas about thinking-in-graphs? [Start a discussion](https://github.com/chenxiachan/thoughtdag/discussions)

## License

[MIT](./LICENSE) © 2026 Xia Chen
