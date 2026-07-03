# ThoughtDAG

**Explore ideas as branching conversations on an infinite canvas.**

[中文](./README.md)

ThoughtDAG turns LLM conversations from linear chat threads into a spatial, editable DAG (Directed Acyclic Graph). Think Figma meets ChatGPT — you can branch, prune, merge, and precisely control what context the AI sees.

![Status](https://img.shields.io/badge/status-prototype-orange) ![License](https://img.shields.io/badge/license-private-lightgrey)

## The Problem

Current LLM interfaces are **linear, append-only, and opaque**:

- Conversations get diluted as they grow — context fills with irrelevant history
- Exploring multiple directions means opening multiple chats, losing connections
- You can't remove a bad response or an irrelevant tangent from the AI's memory
- No way to "select a paragraph and dig deeper" without copy-pasting
- **Users have zero control over the context window**

## The Idea

What if conversations were a **graph on a canvas** instead of a scroll?

- **Nodes** = one round of Q&A (user question + AI response)
- **Edges** = context flow (arrows show what the AI can "see")
- **Add an edge** = inject context. **Delete an edge** = prune context.
- **Branch** from any text selection to explore a tangent
- **Merge** branches by connecting nodes across paths

The context sent to the LLM is determined by a simple rule: **walk up all incoming edges recursively (DAG traversal)**. You control the graph, you control the context.

## Demo

```
[What is ML?] ──blue──▶ [What is DL?] ──blue──▶ [What is a Transformer?]
                              │
                         orange (branch)
                              │
                              ▼
                   [Explain CNNs specifically]
```

- Node 3 ("Transformer") sees context from nodes 1 + 2
- Delete the edge 1→2, connect 1→3 directly → node 3 now sees only node 1
- The branch node ("CNNs") sees nodes 1 + 2 + selected text, but doesn't pollute the main chain

## Features

### ✅ Implemented

- **Infinite canvas** — pan, zoom, drag nodes freely (React Flow)
- **LLM integration** — Qwen Plus via DashScope API (model-agnostic architecture)
- **DAG context engine** — `buildContext()` walks all incoming edges recursively; topological ordering
- **Blue edges** (continue) — ask a follow-up, inherits full ancestor context
- **Orange edges** (branch) — select text → branch to the right, exploratory
- **Cross-linking** — drag to connect any two nodes; merges their context
- **Edge deletion** — right-click any edge → delete; instantly prunes context
- **Regenerate** — creates sibling node (tree branching, not in-place replace)
- **Edit everything** — double-click to edit questions or responses
- **Text selection toolbar** — select text in a response → Branch or Highlight
- **Markdown rendering** — full markdown + syntax highlighting in responses
- **Version management** — navigate between response versions, delete bad ones
- **Focus sidebar panel** — 480px side panel: full Q&A editing, version navigation, highlight management, context chain (DAG traversal + click-to-pan), continue input
- **Highlight system** — select text to ⭐ highlight; 3 downstream propagation modes: 📄 Full text / 🏷️ Tag important / ✂️ Highlights only
- **Distill-regenerate** — highlight key passages → one-click LLM creates refined sibling node
- **Auto-clean stale highlights** — editing a response auto-removes highlights no longer in text
- **Node selection ring** — selected node shows purple highlight ring; context chain click pans canvas
- **Undo/Redo** — Cmd+Z / Cmd+Shift+Z + visible Undo/Redo buttons on canvas
- **Auto-layout** — nodes positioned automatically (blue↓, orange→), dynamic height
- **Collapse/Expand** — fold nodes to save space
- **Token counting** — per-node token usage display
- **Streaming responses** — SSE streaming, real-time token-by-token rendering in FocusPanel + blinking cursor
- **LaTeX rendering** — inline `$...$` and block `$$...$$` math via KaTeX
- **Duplicate node** — copy node with Q&A + highlights, attached to same parent
- **Explore highlights** — click Explore on highlights → input box for follow-up question, highlights injected as branch context
- **Summary highlights** — one-click summarize highlighted content into a new branch node
- **Column-Tree layout** — main chain flows down, branches fork into columns to the right; regenerate siblings align on the same row adjacent to the main axis
- **Collision detection** — same-column nodes auto-nudge to avoid overlap, cascading to descendants
- **Auto-summary per node** — background LLM generates summary; collapsed view shows summary; collapsed nodes pass summary only (context compression)
- **Dynamic collapse layout** — collapsed nodes compact (80px), expanding shifts downstream nodes, preserves manual drag positions
- **Selected node glow** — pulsing purple ring on selected node
- **Multi-select** — left-click drag on canvas to box-select nodes; toolbar: Merge Summary / Merge & Delete / Summary Highlights / Explore / Delete All
- **Stop generation** — Stop button replaces Duplicate during generation; keeps partial content on stop
- **Ancestor edge highlighting** — selected node's path to root highlighted in gold (#F59E0B), other edges dimmed
- **Node role system** — Per-node system prompt (Role) with 3 modes: Inherit from previous / Set for next ↓ / Reset for this node; `appliedRole` records the role used at generation time (editing doesn't affect badge)
- **Multi-role conflict resolution** — When a DAG node has multiple incoming edges with different roles, FocusPanel shows a radio selector (Primary / Cross-link labels); defaults to primary edge, user can override

### 📎 Attachment System (Phase 1 implemented)

**Core differentiator**: Unlike linear chat UIs, ThoughtDAG lets you precisely control attachment inheritance in downstream nodes.

- ✅ **Node-local attachments** — files bind to specific nodes, not global conversation history; drag-drop / paste / click to upload
- ✅ **Inherited attachment control** — FocusPanel shows all upstream attachments with per-file include/exclude toggle (`excludedAttachmentIds` / `includedAttachmentIds` override mechanism)
- ✅ **Full transparency** — see exactly which files the LLM will receive before asking
- ✅ **Single-origin attachment** — attachments appear once at the originating node's position; downstream nodes inherit via DAG traversal; fingerprint dedup keeps them unique across merged paths
- ✅ **Images + Vision** — automatically switches to Qwen-VL when images are present
- ✅ **Text files** — txt/md/code injected directly into context
- ✅ **PDF** — server-side text extraction (pdfjs) + page rendering (poppler); >10 pages defaults to text-only (Vision toggleable); degrades to text-only when poppler is absent
- **Phase 2 (todo)**: DOCX + Web Search
- **Phase 3 (todo)**: LLM Tool Use (autonomous search)

### 📋 Roadmap

#### P0 — Core UX
- [x] **Data persistence** — ✅ auto-save to IndexedDB, survives refresh (undo history and selection stay session-scoped)
- [ ] **Multi-project switching** — project list management (create/switch/rename/delete), each saved independently
- [x] **Streaming responses** — SSE streaming with real-time markdown rendering + blinking cursor in FocusPanel

#### P1 — Deep Node Editing
- [x] **Focus sidebar panel** — 480px side panel with full Q&A editing, version management, highlight management, context chain DAG visualization + click-to-pan
- [x] **Distill-regenerate** — highlight key passages → one-click creates refined sibling node
- [x] **Highlight context propagation** — 3 modes: Full text / Tag important / Highlights only (per-node setting)
- [x] **Auto-clean stale highlights on edit**
- [x] **Auto-summary per node** — ✅ Implemented

#### P2 — Efficiency
- [ ] **i18n** — Chinese/English language switching; UI strings + LLM prompt templates extracted to language packs
- [x] **Collision detection** — Column-Tree layout + collision nudging
- [x] **Multi-select** — box-select with Merge Summary / Merge & Delete / Explore / Delete All
- [x] **Stop generation** — Stop button during streaming, keeps partial content
- [x] **Ancestor edge highlighting** — gold path to root on selection, dimmed others
- [ ] **Edge crossing minimization** — optimize cross-column edge routing to reduce visual crossings
- [ ] **Hover ＋ button below nodes** — hover below a node to reveal a ＋ button; click to create an empty child node (no question, no response) for pre-connecting context, setting roles, or manual edge wiring
- [ ] **Group/Ungroup on multi-select** — box-select nodes → right-click context menu with Group (visual grouping, collapsible into summary node) and Ungroup
- [ ] **Keyboard shortcuts** — Tab=continue, Space=collapse/expand, Esc=cascading dismiss, Delete=remove, R=regenerate, Cmd+D=duplicate, Cmd+E=edit question, ↑↓←→=DAG navigation (parent-child / siblings)
- [ ] **Node search** — Cmd+F opens search, matches node content, centers canvas on result
- [ ] **Canvas new root** — Double-click empty canvas to create a new root node (independent DAG origin); multiple DAG trees coexist on one canvas, later cross-linkable into other nodes' context

#### P2.5 — Node Role System
- [x] **Per-node System Prompt** — 3 modes: Inherit from previous / Set for next ↓ / Reset for this node
- [x] **`appliedRole`** — Records role used at generation time; shown on node badge, unaffected by editing
- [x] **Landing page / New root optional role**
- [x] **Inherit role checkbox** — on Continue / Branch / Highlight Explore inputs
- [x] **Multi-role conflict resolution** — When DAG node has multiple parents with different roles, FocusPanel shows radio selector (Primary vs Cross-link), defaults to primary edge
- [ ] **Role templates** — Preset role library (paper reviewer, Python expert, devil's advocate, teacher etc.), one-click apply to node

#### P3 — Differentiation
- [ ] **Evaluator Nodes (Adversarial Reasoning) ⭐** — GAN-style adversarial structure, ThoughtDAG's core differentiator:
  - 🔴 **Watch edges (red)**: New edge type — Evaluator nodes "subscribe" to main-chain nodes; auto-triggered when main chain produces new content
  - **Role-driven**: Uses per-node rolePrompt (paper reviewer, debug expert, devil's advocate, etc.)
  - **Context semantics**: Evaluator context = own history + watched main-chain content (via red-edge DAG traversal)
  - **Human-in-the-loop**: After each evaluation, user can edit, skip, change role, or adjust trigger frequency (manual / every turn / every N turns)
  - **Visual layout**: Main chain flows down, Evaluator runs in parallel column, red dashed edges connect corresponding rounds horizontally
  - **Use cases**: Paper writing + reviewer, coding + code reviewer, debate (pro vs con), translation + QA, teaching + tutor
  - **Preset templates**: One-click "Debate Mode" / "Paper Review Mode" / "Code Review Mode"
- [ ] **Per-node multi-model switching** — Choose different LLMs per node (Claude/GPT/Qwen/DeepSeek); leverage each model's strengths
- [ ] **Cluster summarization** — Select multiple nodes → summarize into one; originals collapse
- [ ] **Export to file** — Multi-select nodes → LLM organizes into code file / document / paper outline → download. Lightweight output approach
- [ ] **Code block enhancement** — Copy/Run buttons on code blocks, "Open in Editor" with Monaco editor, save back to node

#### P0.5 — Attachment System Phase 1 ✅ Done
- [x] **Image upload + Vision** — Qwen-VL-Plus for image understanding
- [x] **Text file upload** — txt/md/code injected directly into context
- [x] **PDF upload** — server-side text extraction + page rendering, >10 pages defaults to text-only
- [x] **FocusPanel attachment area** — upload zone + inherited attachment list with include/exclude toggles
- [x] **buildContext attachment filtering** — `excludedAttachmentIds` controls which upstream attachments are excluded

#### P4 — Long-term
- [ ] **Attachment System Phase 2/3** — PDF/DOCX parsing, Web Search, LLM Tool Use
- [ ] **Collaboration** — Real-time multi-user editing on the same DAG with cursor sync and conflict resolution
- [ ] **Import chat history** — Auto-convert ChatGPT/Claude JSON exports into DAG structure
- [ ] **Template system** — Preset DAG structures (research, code review, brainstorm); integrates with Evaluator templates
- [ ] **Local LLM** — Ollama integration for fully offline, privacy-sensitive use
- [ ] **Multi-Evaluator collaboration** — Multiple Evaluators with different roles on the same main chain (reviewer + statistician + language editor)
- [ ] **Artifact nodes** — Special file nodes on canvas with 🟢 green contribute edges from source nodes; manual Sync triggers LLM merge; built-in Monaco editor; version history traces back to source nodes. No auto-trigger — user has full control
- [ ] **Local file mapping** — Artifact nodes map to local filesystem (Save/Load/Watch); implement only when user feedback proves the need
- [ ] **Context panel enhancement** — Manual include/exclude ancestors, token budget bar, click-to-locate

## Tech Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + TypeScript + Vite 7 |
| Canvas | @xyflow/react (React Flow) |
| State | Zustand (persist → IndexedDB via idb-keyval) |
| Styling | Tailwind CSS v4 |
| LLM | Zhipu GLM-4.5-Flash / GLM-4V-Flash (free) or Qwen Plus / Qwen-VL — registered automatically based on which keys are in .env (through @mariozechner/pi-ai) |
| Proxy | Express (server.mjs, default port 3001) |

## Quick Start

```bash
npm install
cp .env.example .env   # fill in at least one key: ZHIPU_API_KEY (free) or DASHSCOPE_API_KEY
npm run server         # start the LLM proxy (fails fast with a hint if no key is present)
npm run dev            # in another terminal, start the dev server
# Open http://localhost:5173
```

> **Free tier:** register at [open.bigmodel.cn](https://open.bigmodel.cn/) (phone number only), create an API key and put it in `ZHIPU_API_KEY`. GLM-4.5-Flash (text) and GLM-4V-Flash (vision for images/PDF) are both free and become the default when the key is present.

> **Optional dependency:** PDF page rendering needs poppler (`brew install poppler`). Without it, PDF attachments fall back to text-only mode.
>
> **Data storage:** The canvas auto-saves to browser IndexedDB. To wipe the save, run `indexedDB.deleteDatabase('keyval-store')` in the DevTools console and refresh.

## Architecture

```
Browser (localhost:5173)
  └─ React + React Flow canvas
      └─ Zustand store (nodes, edges, history) ⇄ IndexedDB (auto-save)
          ├─ buildContext(nodeId) → walks DAG → ContextMessage[] + images
          └─ src/lib/api.ts
              ├─ llmCallStream(messages) → POST /api/stream (SSE streaming)
              ├─ llmCall(messages)       → POST /api/claude (non-streaming, summaries)
              └─ extractPdf(base64)      → POST /api/pdf-extract
                        └─ Express proxy (server.mjs) → DashScope API (Qwen Plus, Qwen-VL for images)
```

## License

Private. Not open source (yet).

---

*Built by Xia & Claw 🐾*
