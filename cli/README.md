# thoughtdag

Find the conversations that shaped a file.

```
npx thoughtdag why src/lib/api.ts
```

Indexes the agent sessions already on your machine (Claude Code, Codex) by the files each turn read, wrote or edited, and lists those turns: when, what changed, what was asked, what the answer said about the file. Every hit links back to the conversation.

- Facts come straight off tool calls, never from free text or a model.
- Session files are read, never written. The index lives in `~/.thoughtdag` (0700/0600) and can be deleted with `thoughtdag purge`.
- `Δ` lines are observed changes; `≈` lines are read from the answer and are candidate explanations, not verified reasons.

```
thoughtdag index [--full]
thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]
thoughtdag recall <session> <n>
thoughtdag status
thoughtdag purge
```
