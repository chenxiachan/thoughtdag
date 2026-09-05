---
title: Use ThoughtDAG inside DeepSeek Harness
---

# Use ThoughtDAG inside DeepSeek Harness

The plugin embeds the ThoughtDAG canvas in the Harness web UI. Compose the next turn's context on the graph and let the harness execute it. Session Atlas also lets you explore Claude Code, Codex, and Harness conversations.

## Install

Prerequisites: a configured DeepSeek Harness installation, **0.1.2-rc.1 or later**, with Node.js **22.19+ (22.x) or 24+**.

```bash
dsh plugin --profile web add dsh-thoughtdag
dsh web
```

Open the address printed by `dsh web`. Above the chat, switch to the thought-graph view (**思维图**); select the chat view (**对话**) to return.

The plugin includes the canvas. **No separate ThoughtDAG desktop app, CLI, or MCP installation is required.** Models and tools use your Harness configuration.

## Execution reference

Choose how to run a question in the canvas model picker:

| Selection | Execution | Where the result is stored |
|---|---|---|
| A regular model provided by Harness | Calls the model directly; does not run the full agent tool loop | ThoughtDAG canvas |
| **DeepSeek Harness · Agent** | Runs a real harness turn, with tools as configured in Harness | Canvas and Harness session log |
| An Agent follow-up at the tail of a mirrored Harness session | Continues the corresponding Harness session | A new turn in that session, with the result reflected on the canvas |

Selecting a regular model is not the same as running the Harness Agent. Choose **DeepSeek Harness · Agent** when you want tool execution and a recorded harness turn.

## Example: explore an answer

This is a recording of the actual interface:

<video controls playsinline muted preload="metadata" src="/media/harness-user-take-en.mp4" style="width:100%;border-radius:8px" aria-label="Switch to the thought graph, ask a follow-up, and explore selected text in Harness"></video>

1. Switch from chat to the thought graph in Harness and open an existing node.
2. Double-click the first question-and-answer node to read its full answer in the right panel.
3. Type a follow-up in the panel's lower input and send it. The answer grows into a second, connected node.
4. Select a passage in the second answer and choose **Explore**.
5. The new question and answer form a third node. Check its incoming wires to decide what the next question receives.

Both regular models and Agent mode can create canvas nodes. Whether a turn enters the Harness log depends on the execution mode above, not on whether a node appears.

## Context and sessions

### What reaches the next turn

Upstream nodes, enabled materials, and notes wired into the question become its context. Disconnecting an edge excludes that branch from downstream model context along that path. The nodes remain active on the canvas and can grow or reconnect.

PDF import, text extraction, and material wiring work as in the standalone app. See [Material nodes and reader](./materials) and [Control context](./context-control).

### Append a turn; do not rewrite history

Editing or deleting a mirror node changes the canvas, not an existing Harness session log. Sending through Agent mode executes and records a **new turn** in Harness.

Open [Session Atlas](./session-atlas) from the canvas menu to browse other conversations. The plugin accesses supported sessions on the machine running Harness, not arbitrary files on a browser client.

## Query history

The published `dsh-thoughtdag@0.4.4` provides the canvas and session integration above. For standalone history queries, see [Why layer: CLI and MCP](./why-layer).

::: info Native query tools: awaiting a new npm release
The repository's main branch includes the following native tools and `/why` command. They are not included in the published `dsh-thoughtdag@0.4.4` package and will not appear after installing that version.
:::

| Tool / command | Parameters | Purpose |
|---|---|---|
| `why_check` | `path` | Check whether an object has history |
| `why_file` | `path`; optional `include_read`, `limit` | Retrieve related turns and observed changes |
| `why_find` | `phrase`; optional `in`, `limit` | Find exact words in questions, answers, or materials |
| `why_recall` | `session`, `turn` | Read one complete turn |
| `/why <path\|url\|arxiv:id>` | File path, URL, or paper identifier | Query directly without sending another model message |

Native tools share the CLI's `~/.thoughtdag` index. Relative paths resolve against the current Harness session's working directory. `why_find` is not semantic search, and candidate explanations are not verified causes.

The main-branch implementation enables native tools and a check-history-before-editing prompt by default. Plugin configuration `whyPrompt: false` disables the prompt; `whyTools: false` disables the tools, `/why`, and their prompt. See the [Why manual](./why-layer) for output markers.

## Troubleshooting

| Symptom | Check first |
|---|---|
| No thought-graph switch | Install with `--profile web`, restart `dsh web`, and refresh; check the Harness version and startup logs |
| A model is missing | Check its model configuration and credentials in Harness |
| An answer appears on the canvas but not in the Harness log | Check whether you selected a regular model; use Agent mode for tool execution and a recorded turn |
| Atlas cannot find another tool's sessions | Check that the logs are on the Harness host and use a supported format |
| `/why` is missing after installation | Version `0.4.4` does not include native query tools; see the release note above |

A local index does not mean retrieved content can never leave the device. When an agent uses results in a remote model request, the matching history may be sent with that request. See [Privacy and storage](../reference/privacy-storage).
