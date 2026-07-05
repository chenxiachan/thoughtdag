<div align="center">

<img src="public/favicon.svg" width="88" alt="ThoughtDAG logo"/>

# ThoughtDAG

### Think in branches, not threads

**An infinite canvas that turns LLM conversations into an editable thought graph — you decide exactly what the model sees.**

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072)
![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

[中文](./README_ZH.md) · [Quick Start](#quick-start) · [Features](#features) · [Roadmap](#roadmap)

<img src="docs/hero.png" alt="ThoughtDAG canvas: purple main chain, orange explore branch, red evaluator watch edge, answers with cited references" width="100%"/>

</div>

---

## Why ThoughtDAG?

Every mainstream LLM interface is **linear, append-only, and opaque**:

- The longer a conversation runs, the more your context dilutes — and you can't delete a single line of it
- Want to explore three directions at once? Open three windows and watch them lose all connection
- "Circle this passage and dig deeper" — the most natural gesture there is — can only be faked with copy-paste
- Above all: **you have zero control over what's in the context window**

ThoughtDAG answers with a different data structure: a conversation isn't a list. It's a **graph**.

## One rule to own your context

- **Node** = one Q&A turn · **Edge** = where context flows
- The context sent to the model follows a single rule: **walk all incoming edges, recursively**
- Which means: **adding an edge injects context; deleting an edge prunes it**

```
[What is ML?] ──purple──▶ [What is DL?] ──purple──▶ [What is a Transformer?]
                              │
                        orange (branch from selection)
                              ▼
                    [Explain CNNs specifically]
```

- The "Transformer" node sees nodes 1 + 2; delete 1→2 and wire 1→3 directly — now it sees only node 1
- A branch carries the selected text off to explore without polluting the main chain
- Before every question, a live preview shows "~N tok · M messages · K files" — the context window becomes a dashboard instead of a black box

## Features

### 🧠 Context you can see and shape
Every edge is a context decision: drag to merge branches, click-delete to prune memory, collapse a node and it passes its summary instead of full text (context compression). The send preview tells you what the model will see, before you ask.

### 🌿 Branch anywhere, converge anywhere
Select any passage in an answer → grow an exploration branch to the right; wire branches back together to merge conclusions; regenerate as sibling versions and keep the best; highlight key passages and "distill-regenerate" to strip the noise.

### 👁️ Evaluator nodes
Attach an adversarial "reviewer" to any line of thought (red watch edge): every time the main chain produces new content, a paper reviewer / devil's advocate / statistician fires a critique automatically. Critique history is versioned. GAN-style human-in-the-loop reasoning.

### 🔍 Agentic web search
The model decides when to search (common knowledge: never; time-sensitive facts: always), answers carry inline `[n]` citations, and the references persist with the node — every claim has a clickable source. One globe toggle to go offline.

### ✂️ Editing built for deep reading
Everything is editable, answers keep multiple versions, LaTeX and syntax highlighting render inline, semantic zoom swaps cards for large-type thumbnails when zoomed out, and one-click tidy layout re-organizes the whole graph by arrow order.

### 🗂️ Research-grade workflow
Multi-canvas projects (one topic, one graph), IndexedDB auto-save, JSON backup/import, one-click Markdown export of any context chain, an attachment system (image Vision / dual-channel PDF / precise inheritance control), a bilingual EN/中 interface, and a built-in five-step tutorial.

<details>
<summary><b>📜 Full feature list (50+)</b></summary>

- **Infinite canvas** — pan, zoom, drag nodes freely (React Flow)
- **DAG context engine** — `buildContext()` walks all incoming edges, builds history in topological order
- **Purple edges** (continue) — inherit the full ancestor context
- **Orange edges** (explore) — select text → branch right with the selection as context
- **Cross-linking** — drag to connect any two nodes and merge their context
- **Click-to-delete edges** — select an edge for a floating delete button; right-click menu works too; Cmd+Z undoes
- **Regenerate** — creates a sibling node (tree branching, not in-place replacement)
- **Edit everything** — double-click to edit questions or responses
- **Text selection toolbar** — select response text → Branch or Highlight
- **Markdown + LaTeX** — full markdown, syntax highlighting, inline and block math
- **Version management** — navigate response versions, delete bad ones
- **Focus side panel** — full Q&A editing, version navigation, highlight management, context-chain visualization, follow-up input; drag-resizable width
- **Highlight system** — three downstream modes: 📄 Full text / 🏷️ Tag important / ✂️ Highlights only
- **Distill-regenerate** — highlight key passages → refined sibling node in one click
- **Auto-clean stale highlights on edit**
- **Undo/Redo** — Cmd+Z / Cmd+Shift+Z, full state snapshots
- **Column-Tree auto-layout** — main chain flows down, branches fork right; real measured heights prevent overlap
- **Tidy layout / Align selection** — re-organize the whole graph by arrow order (with confirm); stack selected nodes into a column
- **Collapse/Expand** — collapsed nodes pass summaries instead of full text (context compression); downstream shifts automatically
- **Auto-summary per node** — generated in the background, shown when collapsed
- **Semantic zoom** — cards become large-type thumbnails when zoomed out
- **Token counting** — per-node usage display
- **Streaming responses** — SSE token-by-token rendering with blinking cursor, in node and panel
- **Stop generation** — keeps partial content
- **Retry in place** — failed generations show a Retry button; errors go to toasts, never into answers
- **Ancestor edge highlighting** — the selected node's path to root turns gold, others dim
- **Multi-select** — box-select nodes: Merge Summary / Merge & Delete / Align / Export / Delete
- **Node role system** — per-node system prompt with three modes (inherit / set for next / reset here), `appliedRole` recorded at generation time, radio picker for multi-parent conflicts
- **Role template library** — Reviewer / Devil's Advocate / Statistician / Code Reviewer / Tutor
- **Evaluator nodes** — red watch edges subscribe to a thread, auto/manual critique, versioned critique history
- **Agentic web search** — AI SDK tool loop + Zhipu search API, `[n]` citations + persisted references, guaranteed synthesis fallback
- **Data persistence** — IndexedDB auto-save (1s debounce), survives refresh
- **Multi-canvas projects** — create/switch/rename/delete, each saved independently
- **Export system** — whole-graph JSON backup and import; context-chain / multi-select Markdown export
- **Context send preview** — live "~N tok · M messages · K files" before asking
- **Attachment system** — node-local attachments (drag/paste/upload), inherited include/exclude control, fingerprint dedup, automatic Vision switching for images, dual-channel PDF (text + rendered pages)
- **Bilingual UI** — auto-detects browser language, one-click EN/中 switch
- **Built-in tutorial** — five-step illustrated walkthrough
- **New root anywhere** — double-click empty canvas; multiple trees coexist
- **Environment-based config** — keys live in `.env`; available models register automatically per key

</details>

## Quick Start

```bash
npm install
cp .env.example .env   # fill in at least one key: ZHIPU_API_KEY (free) or DASHSCOPE_API_KEY
npm run server         # start the LLM proxy (fails friendly without a key)
npm run dev            # in another terminal, start the dev server
# open http://localhost:5173
```

> **Free tier:** Register at [open.bigmodel.cn](https://open.bigmodel.cn/) (phone number suffices), create an API key, and set `ZHIPU_API_KEY`. GLM-4.5-Flash (text) and GLM-4V-Flash (vision) are free; web search costs ~¥0.01/query.
>
> **Optional dependency:** PDF page rendering needs poppler (`brew install poppler`); without it PDFs degrade gracefully to text-only.
>
> **Data storage:** Canvases live in browser IndexedDB. To wipe: run `indexedDB.deleteDatabase('keyval-store')` in the DevTools console and refresh.

## Tech Stack & Architecture

| Layer | Technology |
|-------|------------|
| UI | React 19 + TypeScript + Vite 7 |
| Canvas | @xyflow/react (React Flow) |
| State | Zustand (persist → IndexedDB via idb-keyval) |
| Styling | Tailwind CSS v4 |
| LLM | Vercel AI SDK multi-backend: Zhipu GLM (free), Qwen — auto-registered from `.env` keys; Anthropic/OpenAI/DeepSeek/Ollama are one line away |
| Proxy | Express + Vercel AI SDK (server.mjs, default port 3001) |

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

## Roadmap

**Near term**
- [ ] Per-node model switching — cheap Flash for exploration, flagship models for the hard steps
- [ ] MCP tool ecosystem — arXiv retrieval, full-page web reading, and other research tools
- [ ] Keyboard shortcuts + Cmd+F node search
- [ ] Edge-crossing minimization, hover-＋ blank child nodes, group/ungroup

**Long term**
- [ ] Multi-evaluator collaboration (reviewer + statistician + language editor on one thread)
- [ ] Artifact nodes (file deliverables on canvas, Monaco editor + version history)
- [ ] Import ChatGPT/Claude conversation exports as DAGs
- [ ] Collaboration mode, template system, local LLMs (Ollama), DOCX parsing

## License

Private — not yet open source.
