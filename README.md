<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**Find the conversations. Decide what the model sees next.**

![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active_development-6B5CE7)

### [Download ↓](https://chenxiachan.github.io/thoughtdag/#download) · [Website](https://chenxiachan.github.io/thoughtdag/) · [Docs](https://chenxiachan.github.io/thoughtdag/docs/)

[中文](./README_ZH.md) · [DeepSeek Harness plugin](#new--deepseek-harness-available) · [Find past context](#new--pinpoint-the-context-you-need-across-agents) · [Visual app](#want-to-explore-and-shape-the-context-visually) · [How it differs](#how-thoughtdag-differs) · [Session Atlas](#-session-atlas-bring-agent-conversations-onto-the-canvas) · [Research](#-research-why-editable-context-matters) · [Documentation](https://chenxiachan.github.io/thoughtdag/docs/)

</div>

## New · DeepSeek Harness Available!

> ThoughtDAG runs as a view inside the DeepSeek Harness web UI: a 对话 | 思维图 switch above the chat. The canvas is where you decide what the harness sees next; the harness runs the turn.

```bash
dsh plugin --profile web add dsh-thoughtdag
dsh web
```

- **Session Atlas sees all three agents.** The harness's own sessions sit beside Claude Code and Codex; open one as a graph and it follows the conversation live.
- **Ask from the canvas.** Pick one of the harness's models, or **DeepSeek Harness · Agent** to run the question as a real harness turn with tools. The answer streams back into the node, and the turn stays in the harness's session log.
- **The wires decide what the harness sees.** Materials, notes and nodes wired into a question arrive as its context; a follow-up at the tail of a mirrored session continues that session.

<img src="docs/harness-plugin-zh.gif" alt="ThoughtDAG inside DeepSeek Harness: the 对话 | 思维图 switch above the chat, a question asked on the canvas and answered by a harness model, then a follow-up node growing the graph" width="100%"/>

The plugin bundles the canvas; no other ThoughtDAG install is needed. Requires Node 22.19+ and DeepSeek Harness 0.1.2-rc or later.

## New · Pinpoint the context you need across agents

> Start with a code file, an exact phrase, a URL, or a paper. ThoughtDAG searches your local agent conversations and takes you back to the matching turn.

Try it without installing anything:

```bash
npx thoughtdag why src/lib/api.ts
npx thoughtdag find "a phrase you remember"
```

For regular use, install the CLI and connect its read-only MCP tools:

```bash
npm install -g thoughtdag
thoughtdag setup mcp
```

Your agent can then call `why_check`, `why_file`, `find`, and `recall_turn` directly. Conversations from Claude Code, Codex, DeepSeek Harness, and ThoughtDAG canvases are indexed together on your machine; the desktop app is not required.

### What it can find

#### Which conversations changed or mentioned this code

```text
$ npx thoughtdag why src/lib/api.ts
why src/lib/api.ts · 12 turns in 6 sessions
claude-code  ✏️ edit  Q: Can the API detect vision support?
             Δ storedProviders → storedProviders, storedVision…
…
```

#### Which conversations discussed this concept

```text
$ npx thoughtdag find "context.committed" --in q
find "context.committed" · 21 turns in 12 sessions
claude-code  Q: …add context.committed to the event contract…
codex        Q: …context.committed is already half implemented…
…
```

#### Which conversations discussed this file, paper, or webpage

```text
$ npx thoughtdag find "arxiv" --in m
find "arxiv" · 1 turn in 1 canvas
thoughtdag   M: …collective intelligence, artificial life · arXiv:2606.26733…
```

Real local results, shortened to the most useful lines.

> **Give agents less irrelevant history. Reduce context-driven hallucinations and wasted tokens. Improve answer accuracy.** The query layer brings back only the matching history; the canvas lets you cut contaminated branches before they shape the next answer.

## Want to explore and shape the context visually?

The full desktop app adds Session Atlas, an editable context canvas, PDF and file readers, model and search connections, clipping, export, and handoff.

```bash
brew install --cask thoughtdag
```

Or use the [download page](https://chenxiachan.github.io/thoughtdag/#download) for macOS, Windows, and Linux.

<div align="center">

<img src="docs/hero-demo-en.gif" alt="ThoughtDAG hero demo: asking from a PDF passage, editing model context by removing an edge, zooming out into a thought map, exporting a backup, and turning scattered agent sessions into persistent project context with Session Atlas" width="100%"/>

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

### 💎 Condense, zoom out, and export the shape

Merge nodes into a higher conclusion; weave highlights into cited prose. Zoom through full cards, takeaway plaques and an icon skeleton. Then export the current structure as a light or dark Thought Map.

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### 🧭 Session Atlas: bring agent conversations onto the canvas

Bring work scattered across different agents into one editable context graph. Continue from any node, then bring the new work back to where the thought began.

*Currently supports local Claude Code, Codex, and DeepSeek Harness sessions, with more agent integrations in development. Source sessions remain read-only.*

</td>
<td width="45%"><img src="docs/illus/atlas-en.svg" alt="Illustration: local Codex and Claude Code sessions grouped by project, opened as a context graph, then continued in a fresh CLI session"/></td>
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
| Code structure graphs | They answer what connects to what; ThoughtDAG finds the conversations and decisions that shaped it. |
| Agent memory and conversation search | They retrieve text; ThoughtDAG indexes what agents did to files and materials, then lets you control what moves forward. |
| Harness context viewers | They show what a session carries now; ThoughtDAG lets you compose what the next turn receives, and sends it as a real turn. |

ThoughtDAG is a user-authored context graph: incoming paths and explicit references form the next request, while excluded work stays visible on the canvas.

## 🗺️ Export the shape of your thinking

The export keeps the nodes, wires and high-level structural counts. Different questions and different ways of exploring them leave visibly different maps.

<img src="docs/thought-map-four-en.png" alt="Four Thought Map exports showing a deep single thread, five explored branches, a three-week investigation and a literature review season" width="100%"/>

## More ways to run

### Run from source

```bash
npm install
npm run server    # LLM proxy :3001
npm run dev       # → localhost:5173
# No .env? Connect any OpenAI-compatible endpoint inside the app
```

Environment variables, local models and connection details → [docs/setup.md](docs/setup.md)

### Browser demo

Want a ten-second look before installing anything? The [hosted demo](https://app.thoughtdag.workers.dev) runs in the browser, and the example canvas needs no key. It is a feature subset: Session Atlas, local session discovery, keyless web search, some direct-connection tools and the subscription bridge are desktop/local-only.

## 🧪 Research: Why editable context matters

### Context Intervention Benchmark · Pilot v2

`9 models` · `1,485 test runs` · `$0 in free tiers` · `answers scored by exact match`

Context does not only fade as conversations grow longer. A wrong statement flows into the replies that come after it and undermines the truthfulness of every later conclusion. Our benchmark verified this across nine language models and found the effect to be widespread: deleting the message that introduced the error is often not enough, because the follow-up replies still carry it. Restoring correct answers required cleaning up the affected passage as a whole, or letting the model rewrite it. In one model whose step-by-step thinking we could switch on and off, the minimal cleanup only worked while thinking was on. Managing context, not just accumulating it, decides what a model gets right.

The full report explains the method, the numbers and their statistics, and what this does and does not establish. It does not rank models and does not explain their inner workings; it tests one observable claim: changing what a model sees changes what it answers next.

📖 **[Read the first case study](https://chenxiachan.github.io/thoughtdag/stories/context-repair/)** · 📊 **[Methodology and results](https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2/)** · 🗳️ **[Suggest the next model](https://github.com/chenxiachan/thoughtdag/issues/new?template=suggest-next-model.yml)** · 🧪 **[Contribute a run or case](https://github.com/chenxiachan/thoughtdag/issues/new?template=contribute-benchmark.yml)**

## More capabilities

| Capability | What it does |
|------------|--------------|
| 📤 Read-only share | One link carries the whole graph: no account, no server storage |
| 🧭 Staleness & replay | Upstream edits mark the answers they invalidate; replay in dependency order, token estimate first |
| ✂️ Clipping | Select a passage or drag a rectangle in the reader; it becomes canvas material with page provenance |
| 🔌 Any model | Per-node pins that follow the line; text-only models read images through their companion text |
| 🧭 Agent session continuity | Bring sessions from different agents into one map; continue from any node and return the result to the graph. |
| 🔒 Local-first | Automatic folder backup writes real files; point it at a synced folder for cross-device |

Full feature list (60+, grouped by area) → [docs/features.md](docs/features.md)

## Models, cost & privacy

Connect a local Ollama or any OpenAI-compatible endpoint. Built-in presets, subscription connections and environment variables are documented in [setup](docs/setup.md).

- **The free model tier covers every feature**; a local Ollama runs fully offline
- **In the desktop app everything lives on your machine**: canvases, keys, documents; on the web demo, model traffic runs browser-direct and keys never touch the server
- **PDFs never leave your machine**; only extracted text travels when you ask
- **Inside DeepSeek Harness, model calls use the harness's own providers and keys**; ThoughtDAG adds no key of its own, and images and link fetches go through the harness's attachment store and bounded fetcher
- **The backup format stays backward compatible**; Markdown export is the permanent escape hatch

## Contributors

<a href="https://github.com/KehanLiu" title="@KehanLiu"><img src="https://github.com/KehanLiu.png?size=80" width="40" height="40" alt="@KehanLiu" /></a>

Contributions are welcome — start with [CONTRIBUTING.md](./CONTRIBUTING.md).

## Supporters

With gratitude to **@andreilaiter**, ThoughtDAG's first supporter, and to everyone helping this independent open-source project grow.

<a href="https://buymeacoffee.com/chatchan92"><img src="docs/supporters/support-thoughtdag.svg" alt="Support ThoughtDAG" width="252" /></a>

---

<div align="center">

*The graph is acyclic. You are the loop.*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features.md#roadmap) · [Feedback](https://github.com/chenxiachan/thoughtdag/issues) · [Cite](https://github.com/chenxiachan/thoughtdag#cite-this-repository)

</div>
