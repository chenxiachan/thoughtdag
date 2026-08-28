# Codex Adapter Spike — 2026-08-28

> Status: spike report. Tier 1 is implemented and verified live; Tier 2/3
> capabilities are verified against the OFFICIAL repository documentation
> (openai/codex, codex-rs/app-server/README.md) but not yet exercised
> against a running app-server. Nothing here is a compatibility promise.

## Verdict: GO — Codex is the right first deep adapter

Every one of the four continuation modes has an official channel:

| Continuity mode | Official channel | Verification |
|---|---|---|
| Native Continue | `turn/start` (append), `thread/inject_items` (append raw model-visible items without starting a turn) | doc-verified |
| Native Fork | `thread/fork` with `lastTurnId` / `beforeTurnId` (boundary-exact; rejects in-progress boundaries — matching our "stable boundary first" rule) | doc-verified |
| Recompiled Continuation | `thread/start` (+ optional `ephemeral: true`) + `inject_items` | doc-verified |
| Beyond our design | `thread/revert` — replaces durable history with the prefix before a turn, explicitly does NOT revert local file changes (their honest runtime/context split mirrors ours) | doc-verified |

Also official: `thread/read` / `thread/turns/list` / `thread/items/list`
(read-only paginated access), `turn/steer` (in-flight input), `turn/interrupt`,
`thread/compact/start`, JSON-RPC over stdio, and — important for conformance —
`codex app-server generate-json-schema` exports the full message schema per
version.

## Tier 1 — DONE (live-verified)

`src/lib/adapters/codex-session.ts` imports rollout JSONL from
`~/.codex/sessions/` read-only. Verified against crafted fixtures and a real
25MB rollout (193 turns). Projection notes:

- Rollouts carry two parallel channels; we project from `response_item`
  (what the model actually saw), not `event_msg` (the UI stream).
- Turns are explicit (`turn_context` / `task_started` carry `turn_id`) —
  cleaner than Claude Code's inferred boundaries.
- `function_call` ↔ `function_call_output` pair by `call_id` → atomic
  attachments, same grammar as the Claude Code adapter.
- `reasoning` items are encrypted upstream (`encrypted_content`) — dropped,
  and honestly undroppable.
- `role=developer` sandbox/permission boilerplate is runner template, not
  conversation — dropped.
- `session_meta` provides id / cwd / originator / cli_version; `event_msg/
  token_count` provides per-turn usage (future fuel for the token anatomy).

## Capability manifest (current knowledge)

```json
{
  "adapter_id": "thoughtdag.codex",
  "adapter_version": "0.1.0-tier1",
  "capabilities": {
    "read_session_files": "verified-live",
    "read_current_surface": "verified-doc (thread/read)",
    "read_branches": "verified-doc (thread.forkedFromId, parentThreadId filters)",
    "native_resume": "verified-doc (thread/resume)",
    "fork_at_boundary": "verified-doc (thread/fork lastTurnId|beforeTurnId)",
    "tail_rollback": "verified-doc (thread/revert)",
    "append_context": "verified-doc (turn/start)",
    "inject_native_items": "verified-doc (thread/inject_items)",
    "steer_inflight_turn": "verified-doc (turn/steer)",
    "interrupt_turn": "verified-doc (turn/interrupt)",
    "trigger_compaction": "verified-doc (thread/compact/start)",
    "stream_events": "verified-doc (turn/item notifications)",
    "observe_runtime": "unknown",
    "preserve_runtime": "unknown",
    "write_native_transcript": "never (by our contract)"
  }
}
```

`verified-doc` = present in the official README at spike time; the schema
export (`generate-json-schema`) makes drift detectable. `unknown` stays
unknown until exercised live.

## Environment notes (this machine)

- `codex` CLI binary is NOT on PATH; sessions were produced by Codex
  Desktop (`originator: "Codex Desktop"`, `source: vscode`).
- Rollouts live under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
  archived ones under `~/.codex/archived_sessions/`.

## Next steps (in order, each gated on the previous)

1. Live Tier 2 spike: install the codex CLI, run `codex app-server`,
   exercise `thread/read` + `thread/fork` + `inject_items` against a real
   thread, and export the JSON schema into this directory as the drift
   sentinel. Time-box: one day.
2. Only then: design the Native Envelope for Codex (Bundle → Responses API
   items) and the deep adapter proper.
3. Non-goals until then: steer/realtime, multi-agent subagent threads,
   runtime observation.
