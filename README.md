<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**Your thinking deserves a map.** An infinite canvas where LLM conversations grow into an editable thought graph.

![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

### [Download ↓](https://chenxiachan.github.io/thoughtdag/#download) · [Website](https://chenxiachan.github.io/thoughtdag/)

[中文](./README_ZH.md) · [Quick start](#quick-start) · [How it differs](#how-thoughtdag-differs) · [Research](#research--context-intervention-benchmark) · [Models & privacy](#models-cost--privacy)

<img src="docs/hero-demo-en.gif" alt="Hero demo, recorded from the live app: selecting a passage in the PDF reader and asking about it; deleting a noise edge and regenerating a clean answer; zooming out through three semantic tiers to the map; opening the backup control center and exporting a real file" width="100%"/>

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

| Type | What a wire means | Better for |
|------|-------------------|------------|
| Linear chat | Conversation history in time order | Quick, simple questions |
| Mind maps and whiteboards | Visual relations for human eyes | Free-form organizing and presenting |
| Branching chat canvases | Parent-child forks of a conversation | Exploring alternative responses |
| Workflow and agent canvases | Data flow or execution order | Automation and orchestration |
| ThoughtDAG | The context the model actually receives next | Deliberate forking, merging, pruning and tracing of long-running thinking |

If you already keep a hand-maintained decision tree in a markdown file, ThoughtDAG is that tree made operational: the model reads exactly the branches you wire in.

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

## Research · Context Intervention Benchmark

ThoughtDAG is also a testbed for a concrete question: when misleading context enters an LLM conversation, how much of the affected path must be removed before the answer recovers?

In the first pilot, deleting only the source repaired **68/72** derailed model-cases. Removing the contaminated subgraph repaired **72/72**. This does not explain hidden model reasoning or rank models; it tests how changing visible context changes the next answer.

🧪 **[Read the first case study](https://chenxiachan.github.io/thoughtdag/stories/context-repair/)** · 📊 **[Methodology and results](https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v1/)** · 💬 **[Suggest a model for the next run](https://github.com/chenxiachan/thoughtdag/issues/new)**

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

[Support ThoughtDAG →](https://buymeacoffee.com/chatchan92)

---

<div align="center">

*The graph is acyclic. You are the loop.*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features.md#roadmap) · [Feedback](https://github.com/chenxiachan/thoughtdag/issues) · [Cite](https://github.com/chenxiachan/thoughtdag#cite-this-repository)

</div>
