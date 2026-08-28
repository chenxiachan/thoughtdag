# Codex Adapter Spike — 2026-08-28

> Status: spike report, LIVE-VERIFIED. Tier 1 is implemented and verified;
> the Tier 2 surface was exercised against a running `codex app-server`
> (codex-cli 0.150.1) on real stored threads. Nothing here is a
> compatibility promise.

## Live exercise results (codex-cli 0.150.1, 2026-08-28)

7/8 checks passed against the user's real thread store:

- `initialize` handshake ✓ (JSON-RPC over stdio, newline-delimited)
- `thread/list` ✓ — NOTE: the result rides in `data`, not `threads`;
  `archived: true` lists archived sessions; Desktop-era (0.130) rollouts
  are visible to the 0.150 CLI store.
- `thread/read` (includeTurns) ✓ — read-only, no resume.
- `thread/fork { ephemeral: true }` ✓ — in-memory branch, `path: null`,
  `forkedFromId` lineage recorded. THE safe mutation surface for spikes
  and previews: stored history untouched.
- `thread/fork { lastTurnId }` ✓ — boundary-exact fork accepted.
- `thread/inject_items` ✓ accepted on the ephemeral fork (returns `{}`).
  ⚠ Partial: the injected item did not surface via `thread/read`
  (turn-view) and `thread/items/list` rejected the ephemeral thread —
  model-visibility could not be confirmed without running a paid turn.
  Next verification: `turn/start` on an ephemeral fork and observe
  whether the model sees the injected context.
- Notification stream observed: `thread/started`,
  `thread/tokenUsage/updated`, `mcpServer/startupStatus/updated`.

Drift sentinel: `schema.checksums.txt` (sha256 of the 40-file JSON schema
exported by `codex app-server generate-json-schema`; the raw schema stays
untracked — re-export and diff the checksums to detect protocol drift).

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
  "adapter_version": "0.1.0-tier1", "runner_version_exercised": "codex-cli 0.150.1",
  "capabilities": {
    "read_session_files": "verified-live",
    "read_current_surface": "verified-live (thread/read)",
    "read_branches": "verified-live (forkedFromId on fork)",
    "native_resume": "verified-doc (thread/resume)",
    "fork_at_boundary": "verified-live (thread/fork lastTurnId)",
    "tail_rollback": "verified-doc (thread/revert)",
    "append_context": "verified-doc (turn/start)",
    "inject_native_items": "verified-live-accepted (visibility pending a paid turn)",
    "steer_inflight_turn": "verified-doc (turn/steer)",
    "interrupt_turn": "verified-doc (turn/interrupt)",
    "trigger_compaction": "verified-doc (thread/compact/start)",
    "stream_events": "verified-live (thread/tokenUsage etc. observed)",
    "observe_runtime": "unknown",
    "preserve_runtime": "unknown",
    "write_native_transcript": "never (by our contract)"
  }
}
```

`verified-doc` = present in the official README at spike time; the schema
export (`generate-json-schema`) makes drift detectable. `unknown` stays
unknown until exercised live.

## One-command entry (mirrors the Claude Code `/thoughtdag`)

`thoughtdag.md` in this directory is a Codex custom prompt. Install:

```bash
mkdir -p ~/.codex/prompts && cp thoughtdag.md ~/.codex/prompts/
```

Then `/thoughtdag` inside Codex does the same dance as the Claude Code
command: locate the current rollout (newest, cwd-matched) → read-only
snapshot to Desktop → loopback bridge on :38017 → open the local canvas
with `#import-url`. The frontend dispatcher recognizes both runners, and
harvest mode (`/thoughtdag harvest`) works for Codex sessions too — the
branch builder is runner-agnostic (`src/lib/adapters/shared.ts`).

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
