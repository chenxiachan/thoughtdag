<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**Your thinking deserves a map.** An infinite canvas where LLM conversations grow into an editable thought graph.

![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

### [Download ↓](https://chenxiachan.github.io/thoughtdag/#download) · [Website](https://chenxiachan.github.io/thoughtdag/)

[中文](./README_ZH.md) · [Quick start](#quick-start) · [How it differs](#how-thoughtdag-differs) · [Research](#-research-why-editable-context-matters) · [Models & privacy](#models-cost--privacy)

<img src="docs/hero-demo-en.gif" alt="Hero demo, recorded from the live app: selecting a passage in the PDF reader and asking about it; deleting a noise edge and regenerating a clean answer; zooming out through three semantic tiers to the map; opening the backup control center and exporting a real file" width="100%"/>

<p align="center"><a href="https://www.youtube.com/watch?v=-8BqAyaoNXQ"><img src="https://img.youtube.com/vi/-8BqAyaoNXQ/maxresdefault.jpg" alt="YouTube thumbnail for the ThoughtDAG narrated tour" width="640" /></a></p>

**[▶ The 33-second narrated tour](https://www.youtube.com/watch?v=-8BqAyaoNXQ)**

</div>

## The one rule

> **Wires are the context.** What the model sees is exactly what wires into the node. Editing the graph edits the model's memory.

Many tools put conversations on a canvas. In ThoughtDAG, a wire is not decoration or an execution route. It determines what the model sees next.

## In action

One principle behind every gesture: **the human in the loop, the model on the wires**. No autonomous agent redraws your graph.

<table>
<tr>
<td width="45%"><img src="docs/illus/prune-en.svg" alt="Illustration: the research chain wired to a summary node, with the edge to a dinner node cut into a red dashed line"/></td>
<td width="55%">

### ✂️ Delete one edge, get a different answer

The model sees only what wires in. Delete the noise edge, ask again, and the same prompt returns a clean answer. **Reproduce it in chapter ③ of the example canvas.**

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### 📖 Read a paper into a map

Select a passage, ask right there. The answer lands on the canvas with its page number, and the p.N chip jumps back to the page. **Finish the paper, and the map is drawn.**

</td>
<td width="45%"><img src="docs/illus/reading-en.svg" alt="Illustration: a passage selected on the original page, a purple ask bubble beside it, the paragraph tagged p.3"/></td>
</tr>
</table>

<table>
<tr>
<td width="45%"><img src="docs/illus/map-en.svg" alt="Illustration: three takeaway plaques with ruled-out, decided and pivoted badges, linked by dashed lines"/></td>
<td width="55%">

### 💎 Condense the graph, then zoom out

Merge nodes into one higher conclusion; weave your highlights into cited prose. Then zoom through full cards, takeaway plaques and an icon skeleton. **The graph folds inward instead of sprawling.**

</td>
</tr>
</table>

## How ThoughtDAG differs

Many products use nodes and edges, but the graph does a different job in each category.

| Product category | How it differs from ThoughtDAG |
|---|---|
| Linear chat | Context follows one chronological thread; ThoughtDAG selects and merges visible paths. |
| Mind maps and whiteboards | Edges organize ideas for people; ThoughtDAG edges also change model input. |
| Branching chat canvases | They usually follow one inherited branch; ThoughtDAG can merge or prune several paths. |
| Workflow and agent canvases | Edges run tasks and data; ThoughtDAG edges control conversational context. |
| RAG and automatic memory | The system retrieves context automatically; ThoughtDAG makes the selection visible and editable. |

ThoughtDAG is a user-authored context graph: incoming paths and explicit references form the next request, while excluded work stays visible on the canvas.

## Quick start

### Desktop app

Download, open, think. The [download page](https://chenxiachan.github.io/thoughtdag/#download) detects your platform and gives you the right installer; [Releases](https://github.com/chenxiachan/thoughtdag/releases/latest) keeps every build. macOS builds are signed and notarized. Windows builds are not signed yet and may show a SmartScreen warning.

### Run from source

```bash
npm install
npm run server    # LLM proxy :3001
npm run dev       # → localhost:5173
# No .env? Connect any OpenAI-compatible endpoint inside the app
```

Environment variables, local models and connection details → [docs/setup.md](docs/setup.md)

### Browser demo

Want a ten-second look before installing anything? The [hosted demo](https://app.thoughtdag.workers.dev) runs in the browser, and the example canvas needs no key. It is a feature subset: keyless web search, some direct-connection tools and the subscription bridge are desktop/local-only.

## 🧪 Research: Why editable context matters

### Context Intervention Benchmark · Pilot v2

When misleading context enters an LLM conversation, how much of the affected path must be removed before the answer recovers?

> Across seven models, **116/126** cases recovered after deleting only the misleading source; **126/126** after removing the contaminated subgraph. A same-size reasoning twin repaired *fewer* residual-context cases than its non-reasoning sibling.

This does not explain hidden model reasoning or rank models. It tests a narrower, observable claim: changing visible context changes the next answer.

📖 **[Read the first case study](https://chenxiachan.github.io/thoughtdag/stories/context-repair/)** · 📊 **[Methodology and results](https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2/)** · 💬 **[Suggest a model for the next run](https://github.com/chenxiachan/thoughtdag/issues/new)**

## More capabilities

| Capability | What it does |
|------------|--------------|
| 📤 Read-only share | One link carries the whole graph: no account, no server storage |
| 🧭 Staleness & replay | Upstream edits mark the answers they invalidate; replay in dependency order, token estimate first |
| ✂️ Clipping | Select a passage or drag a rectangle in the reader; it becomes canvas material with page provenance |
| 🔌 Any model | Per-node pins that follow the line; text-only models read images through their companion text |
| 🔒 Local-first | Automatic folder backup writes real files; point it at a synced folder for cross-device |

Full feature list (60+, grouped by area) → [docs/features.md](docs/features.md)

### Works beside your coding agent

Automatic folder backup keeps the canvas as a live `.thoughtdag.json` file in your project; Markdown export turns any context chain or selection into a plain `.md`. Coding agents can read either without a plugin, API or server.

## Models, cost & privacy

Connect a local Ollama or any OpenAI-compatible endpoint. Built-in presets, subscription connections and environment variables are documented in [setup](docs/setup.md).

- **The free model tier covers every feature**; a local Ollama runs fully offline
- **In the desktop app everything lives on your machine**: canvases, keys, documents; on the web demo, model traffic runs browser-direct and keys never touch the server
- **PDFs never leave your machine**; only extracted text travels when you ask
- **The backup format stays backward compatible**; Markdown export is the permanent escape hatch

## Supporters

With gratitude to **@andreilaiter**, ThoughtDAG's first supporter, and to everyone helping this independent open-source project grow.

<a href="https://buymeacoffee.com/chatchan92"><img src="docs/supporters/support-thoughtdag.svg" alt="Support ThoughtDAG" width="252" /></a>

---

<div align="center">

*The graph is acyclic. You are the loop.*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features.md#roadmap) · [Feedback](https://github.com/chenxiachan/thoughtdag/issues) · [Cite](https://github.com/chenxiachan/thoughtdag#cite-this-repository)

</div>
