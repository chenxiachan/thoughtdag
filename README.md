<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**Your thinking deserves a map.** An infinite canvas where LLM conversations grow into an editable thought graph.

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

**[▶ Try it live](https://app.thoughtdag.workers.dev)** — no install, no signup; the example canvas needs no key

[中文](./README_ZH.md) · [Quick start](#quick-start) · [More capabilities](#more-capabilities) · [Models](#supported-models) · [Cost & privacy](#cost--privacy)

</div>

## The one rule

**Long chats dilute context — and you can't see what the model reads.**
Here the model sees exactly what wires into the node. Delete one edge, get a different answer.

**The good answer is buried at turn 47, and finding it again is archaeology.**
Zoom out: takeaway plaques and cognitive badges turn the canvas into a map of what you learned.

**Your thinking is locked in someone else's server.**
The canvas lives in your browser; backups are real files on your disk, yours to take anywhere.

ThoughtDAG replaces the whole black box with one rule:

> **Wires are the context.** Every question is a node, every wire is context, and editing the graph edits the model's memory.

## In action

<img src="docs/hero-demo-en.gif" alt="Hero demo, recorded from the live app: selecting a passage in the PDF reader and asking about it; deleting a noise edge and regenerating a clean answer; zooming out through three semantic tiers to the map; opening the backup control center and exporting a real file" width="100%"/>

<table>
<tr>
<td width="45%"><img src="docs/illus/reading-en.svg" alt="Illustration: a passage selected on the original page, a purple ask bubble beside it, the paragraph tagged p.3"/></td>
<td width="55%">

### 📖 Read a paper into a map

Read the original pages; select a passage and ask. The answer streams in beside the document, and the question lands on the canvas wired to the material, page number included; asked passages keep a mark, and the node's p.N chip jumps straight back to that page. **By the time you finish the paper, the map is already drawn.**

</td>
</tr>
</table>

<img src="docs/reading-en.gif" alt="Screen recording: selecting a sentence on the original PDF page, asking about it, the answer streaming into the annotation rail while the passage keeps a bubble mark, then a guided digest with page jumps" width="100%"/>

<table>
<tr>
<td width="55%">

### 🧠 Delete one edge, get a different answer

Merging branches is drawing a wire; pruning memory is deleting one; archived nodes exit every future context. The claim is testable: keep the prompt identical, delete the noise edge, and the same question returns a clean answer. **Reproduce it yourself in chapter ③ of the example canvas.**

</td>
<td width="45%"><img src="docs/illus/prune-en.svg" alt="Illustration: the research chain wired to a summary node, with the edge to a dinner node cut into a red dashed line"/></td>
</tr>
</table>

<img src="docs/prune-en.gif" alt="Screen recording: a summary node wired to both the research chain and an off-topic dinner node absorbs the noise; the noise edge is clicked, deleted, and regeneration returns a clean summary" width="100%"/>

<table>
<tr>
<td width="45%"><img src="docs/illus/map-en.svg" alt="Illustration: three takeaway plaques with ruled-out, decided and pivoted badges, linked by dashed lines"/></td>
<td width="55%">

### 🗺️ Zoom out — thinking becomes a map

Three semantic-zoom tiers: full cards, takeaway plaques, an icon skeleton. Every step wears a cognitive badge — ✕ ruled out · ⚖ decided · ↩ pivoted · ? open. Seals keep a fixed screen size, so the far view stays dense. **The detours you took are part of the map.**

</td>
</tr>
</table>

<img src="docs/hero-en.png" alt="ThoughtDAG map view: a waterfall DAG of thought, every plaque badged by cognitive move, with the focus panel showing a node's full answer and its token-priced context chain" width="100%"/>

<table>
<tr>
<td width="55%">

### ✨ The passages you marked, woven into cited prose

Highlights are the content you judged worth keeping. One overview lists every mark — by time or by node, each pinpointing its source; check any subset and weave it into one passage where every sentence traces back.

</td>
<td width="45%"><img src="docs/illus/weave-en.svg" alt="Illustration: a highlighted sentence in a card woven into a cited passage below, with reference numbers"/></td>
</tr>
</table>

## Quick start

```bash
# Online: app.thoughtdag.workers.dev (example canvas needs no key)
# Local:
npm install
npm run server    # LLM proxy :3001
npm run dev       # → localhost:5173
# No .env? Connect any OpenAI-compatible endpoint inside the app
```

The first launch opens a seeded example canvas: four chapters around one everyday question (why saved articles stay unread), including a reading loop with a real embedded PDF. Environment variables, free keys and configuration details → [docs/setup.md](docs/setup.md)

## More capabilities

| Capability | What it does |
|------------|--------------|
| 📤 Read-only share | One link carries the whole graph — no account, no server storage |
| 🧭 Staleness & replay | Upstream edits mark the answers they invalidate; replay in dependency order, token estimate first |
| 🧪 Paradigms | Human-machine workflows saved as files; change the input, replay the experiment |
| 🔌 Any model | Per-node pins that follow the line; image requests reroute to vision models automatically |
| 🔒 Local-first | Automatic folder backup writes real files; point it at a synced folder for cross-device |

Full feature list (60+, grouped by area) → [docs/features.md](docs/features.md)

## Supported models

Zhipu · Qwen · OpenAI · Anthropic · Google · DeepSeek · Kimi · OpenRouter · Ollama, or any OpenAI-compatible endpoint. Requests with images reroute to vision models automatically. Environment variables and default models → [docs/setup.md](docs/setup.md)

## Cost & privacy

- **The free model tier covers every feature**; a local Ollama runs fully offline
- **On the hosted demo, model traffic runs browser-direct** — keys never touch the server
- **PDFs never leave your machine**; only extracted text travels when you ask
- **The backup format stays backward compatible**; Markdown export is the permanent escape hatch

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

---

<div align="center">

*The graph has no cycles. The loop is you.*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features.md#roadmap) · [Feedback](https://github.com/chenxiachan/thoughtdag/issues)

</div>
