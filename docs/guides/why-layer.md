# Why layer: CLI and read-only MCP

The Why layer indexes local Claude Code, Codex, DeepSeek Harness, and ThoughtDAG canvas conversations together. Start with a file, an exact phrase, a URL, or an arXiv paper id; the result points back to the matching turn.

## Install

Try one query without installing:

```bash
npx thoughtdag why src/lib/api.ts
```

For regular use, install the command globally and build the local index:

```bash
npm install -g thoughtdag
thoughtdag index
```

### Connect the read-only MCP server

From the project where you want to use it:

```bash
thoughtdag setup mcp
```

This registers ThoughtDAG in the current project's `.mcp.json` for Claude Code and in `~/.codex/config.toml` for Codex. Queries remain scoped to the current workspace. The MCP server can search and recall; it cannot edit a canvas or a source session.

### Optionally add project rules

```bash
thoughtdag setup rules
thoughtdag setup rules --remove
```

The first command adds a marked block to this project's `CLAUDE.md` and `AGENTS.md`, asking agents to check relevant history before editing a file. The second removes only that block. Nothing is added to a global instruction file.

## CLI reference

For native Harness queries and their release status, see the [DeepSeek Harness plugin](./deepseek-harness#query-history). Native `why_find` and `why_recall` correspond to MCP `find` and `recall_turn` below.

| Command | Purpose |
|---|---|
| `thoughtdag index [--full] [--canvas <dir>]` | Build or refresh the index; optionally remember a canvas-backup directory |
| `thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]` | Show turns that touched a file, URL, or paper |
| `thoughtdag why --check <path> [--fresh] [--json]` | Cheap check for whether an artifact has history |
| `thoughtdag find "<phrase>" [--in q\|a\|m] [--limit N] [--json]` | Exact, case-insensitive search across questions, answers, or materials |
| `thoughtdag recall <session> <n>` | Print one turn in full |
| `thoughtdag status` | Show index size and evidence coverage |
| `thoughtdag purge [--cache]` | Delete all derived data, or only rebuildable caches |
| `thoughtdag events <session-file> [--touches]` | Project one source file into canonical events |
| `thoughtdag mcp` | Serve the four read-only tools over stdio MCP |
| `thoughtdag setup [mcp \| rules [--remove]]` | Inspect or change project integration |

`<path>` may be an absolute path, a path relative to the current workspace, a URL, or `arxiv:<id>`.

## MCP tool dictionary

| Tool | Arguments | Returns |
|---|---|---|
| `why_check` | `path` | One-line history yes/no check |
| `why_file` | `path`, optional `include_read`, `limit` | Matching turns and observed file changes |
| `find` | `phrase`, optional `in`, `limit` | Exact matches in questions (`q`), answers (`a`), materials (`m`), or all three |
| `recall_turn` | `session`, `turn` | Full question, answer, and tool trail for one turn |

## Output dictionary

| Marker | Meaning |
|---|---|
| `Q` | The user's question, verbatim excerpt |
| `A` | The agent's answer, verbatim excerpt |
| `M` | Text attached to a ThoughtDAG canvas node |
| `Δ` | Observed edit or write from a tool call |
| `≈` | Candidate explanation inferred from the answer; not a verified fact |
| `↗` | Pointer back to the source turn or canvas node |

## Examples

### Find the conversations that changed a file

```text
$ thoughtdag why src/lib/api.ts
why src/lib/api.ts · 12 turns in 6 sessions
claude-code  ✏️ edit  Q: Can the API detect vision support?
             Δ storedProviders → storedProviders, storedVision…
```

Add `--include-read` when read-only touches also matter. Use `--all` to remove the default result cap.

### Find where a concept appeared

```text
$ thoughtdag find "context.committed" --in q
find "context.committed" · 21 turns in 12 sessions
claude-code  Q: …add context.committed to the event contract…
codex        Q: …context.committed is already half implemented…
```

Use `--in a` for answers and `--in m` for canvas materials.

### Find a paper or webpage

```bash
thoughtdag why arxiv:2606.26733
thoughtdag why https://example.org/paper
thoughtdag find "arxiv" --in m
```

### Open one matching turn in full

Copy the session id and turn number shown by `why` or `find`:

```bash
thoughtdag recall <session-id> <turn-number>
```

If the desktop app is installed, the `↗` link opens the matching turn or canvas node.

For the visual session browser and editable context graph, continue with [Session Atlas](./session-atlas).
