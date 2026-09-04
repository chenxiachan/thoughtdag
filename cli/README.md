# thoughtdag

Find the conversations that shaped a file.

```
npx thoughtdag why src/lib/api.ts
```

Indexes the agent sessions already on your machine (Claude Code, Codex, DeepSeek Harness) by the files each turn read, wrote or edited, and lists those turns: when, what changed, what was asked, what the answer said about the file. Every hit links back to the conversation.

- Facts come straight off tool calls, never from free text or a model.
- Session files are read, never written. The index lives in `~/.thoughtdag` (0700/0600) and can be deleted with `thoughtdag purge`.
- `Δ` lines are observed changes; `≈` lines are read from the answer and are candidate explanations, not verified reasons.

```
thoughtdag index [--full] [--canvas <dir>]
thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
thoughtdag why --check <path>            # one line, exit 0/1: is there history here?
thoughtdag find "<phrase>" [--in q|a|m]  # where these exact words were asked, answered or attached
thoughtdag recall <session> <n>
thoughtdag status
thoughtdag purge [--cache]
thoughtdag mcp                           # the same questions as MCP tools (stdio, read-only)
thoughtdag setup [mcp | rules [--remove]]
```

## Let the agent ask on its own

`thoughtdag setup mcp` registers the server for Claude Code in this project's `.mcp.json` and for Codex in `~/.codex/config.toml`; the agent then has `why_check`, `why_file`, `find` and `recall_turn` as tools. `thoughtdag setup rules` adds two lines to this project's `CLAUDE.md` and `AGENTS.md` — check for history before editing a file; query before explaining why code is the way it is — as a marked block, `--remove` takes it out. Both are per project and explicit; nothing is written unless you ask.
