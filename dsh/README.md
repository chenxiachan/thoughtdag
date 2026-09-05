# dsh-thoughtdag

This directory is the DeepSeek Harness plugin of [ThoughtDAG](../README.md), published to npm as `dsh-thoughtdag`; its version follows the app's, and the ThoughtDAG build it embeds is the one in this tree.

ThoughtDAG for DeepSeek Harness: open DSH sessions (live or on disk) as
editable thought graphs on ThoughtDAG's infinite canvas — from inside the
harness UI.

This is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin (a Cordis plugin distributed as an npm package), built on the same shell
pattern as [dsh-synapse](https://github.com/liangmianya/dsh-synapse): the host
half mounts the ThoughtDAG SPA under `/thoughtdag/` on the EXISTING harness
web server (no second process, no second port), and the client half adds a
floating "对话 | 思维图" switch that shows the canvas in a same-origin
full-screen iframe.

## What works

- `dsh plugin --profile web add dsh-thoughtdag` installs the plugin
- The harness GUI gains a view switch; "思维图" opens ThoughtDAG at
  `/thoughtdag/` (same origin — no CORS, no second server)
- The host serves the SPA plus a read-only session bridge:

  | Endpoint | Purpose |
  |---|---|
  | `GET /thoughtdag/api/disksessions` | list durable sessions on disk (id, title, cwd from the session header; newest first) |
  | `GET /thoughtdag/api/disksessions/<id>/log` | one disk session as JSONL — the exact dialect ThoughtDAG's `dsh-session` adapter parses, so a past harness session imports like a local file |
  | `GET /thoughtdag/api/sessions` | list live sessions in this process |
  | `GET /thoughtdag/api/sessions/<id>/log` | one live session's events as JSONL |
  | `GET /thoughtdag/api/sessions/<id>/turns` | turn boundaries (start/end seq, the person's message id) of a live or on-disk session — the fork points a canvas can name |
  | `POST /thoughtdag/api/sessions/<id>/fork` | `{ afterTurn }` or `{ atSeq }` → a child session inheriting the prefix through that completed turn (`sessionController.fork`, so the chat UI lists it) |
  | `POST /thoughtdag/api/sessions/<id>/inject` | `{ text }` or `{ blocks: [{type:'text',text}] }` → model-facing context for the next step (`agent.inject`; no wake; shown in the transcript as injected context from `dsh-thoughtdag`) |
  | `POST /thoughtdag/api/sessions/<id>/followup` | `{ text | blocks, mode?: 'queue' | 'steer' }` → a user prompt through `sessionController.prompt`, exactly as the composer sends one |
  | `GET /thoughtdag/api/roots` · `GET /thoughtdag/api/roots/<key>/list\|head\|read\|range` | the other agents' session directories on this machine (`claude-projects` = `~/.claude/projects`, `codex-sessions` = `~/.codex/sessions`) with the desktop bridge's file primitives, so Session Atlas inside the harness lists all three sources and mirrors a Claude Code or Codex session as the desktop does; `rel` never escapes its root |
  | `GET /thoughtdag/api/models` | the harness's model catalog in the SPA's list shape (`<provider>/<model>` ids, the harness default) |
  | `POST /thoughtdag/api/stream` · `POST /thoughtdag/api/claude` | the SPA's own proxy protocol, answered on the harness's providers and credentials (`ctx.llm.stream`); the embedded SPA is built with `VITE_API_BASE=/thoughtdag`, so its model picker and every canvas-native generation (summaries, condensing, a canvas that is not a mirrored session) run on the harness's models. These calls do not enter a session log; a mirrored session's turns go through `/followup` |
  | `harness/agent` (a catalog entry) | pick it in the picker and the question goes INTO the harness: a fresh session per call, the canvas's wired context injected first (`agent.inject`, source `dsh-thoughtdag`), the question as a user follow-up, the harness's own agent loop with tools; text, reasoning and tool calls stream back as the SPA's frames, the first frame names the session (`{ harnessSession }`) and, once the question enters the surface, the turn it created (`{ harnessTurn: { turn, userMessageId, seq } }`), so the canvas can mark its node as that turn's mirror instead of receiving it twice. The session stays in the Chat and the atlas. `harness: { cwd }` sets the session's working directory (the canvas passes the project it mirrors, else the current chat session's); `harness: { session }` continues a mirrored session instead of forking a fresh one (a tail follow-up); `images` (base64) are admitted through the controller's prompt and a vision model is selected for that turn, so a picture the canvas holds is read by the harness's own eyes |
  | `POST /thoughtdag/api/fetch-url` | the SPA's link snapshot (`{ url }` → `{ title, text, fetchedAt, html? }`) through the harness's bounded, credential-free fetcher (`ctx.web.fetch`) |

  Disk logs are zstd *concatenated-frame* files; the bridge locates frame
  boundaries structurally and decodes each with `node:zlib` (the same walk the
  DSH persistence backend performs), so no external zstd binary or native
  module is needed.
- The bridge is Host-header fenced (localhost/127.0.0.1 + `trustedHosts`)

## Verified (2026-09)

- installed into the local `web` profile via `dsh plugin --profile web add <dir>`
- a fresh web-profile boot serves `/thoughtdag/` (SPA) and the bridge API; the
  index injection table lists `dsh-thoughtdag/client.js`
- headless-browser walk: the "对话 | 思维图" switch appears, the full-screen
  same-origin iframe opens, and ThoughtDAG boots inside it
- fetching the bridge from INSIDE the thoughtdag origin works with no extra
  auth: `GET /thoughtdag/api/disksessions` lists every on-disk session (new
  sessions created by the running instance appear automatically) and
  `GET .../log` returns the full event stream
- real session logs decode correctly (multi-frame zstd → 15k+ JSONL lines,
  identical to the `zstd` CLI)
- the live bridge (`/api/sessions`) reflects the running instance's active
  session as soon as the GUI opens one (verified: opening the UI surfaces the
  auto-created session with its live seq), complementing the disk archive

### Canvas-side import

ThoughtDAG's own session importer (`dsh-session` adapter + the canonical
import path) accepts the bridge's JSONL verbatim. Wiring a "DSH sessions"
source into the in-iframe canvas UI (Session Atlas) is planned; the bridge is
the data plane it will read.

## Not yet (roadmap)

- Canvas UI for the write bridge: name a fork point on a node, hand a compiled context to `inject`, continue with `followup`; the client already switches the chat to a session the canvas names (`td:select-session`)
- `replace`: shadow a surface range from the canvas (DSH's compaction primitive); needs a live check of how the chat renders a replaced range
- Theme sync and live session following in the iframe
- A real "import current session" affordance inside the canvas UI

## Development

```bash
# 1. build the embedded ThoughtDAG SPA with a /thoughtdag/ subpath base (from the repo root)
npm run dsh:build            # writes dsh/dist-app, which git ignores

# 2. install into a profile from this directory (pnpm link)
dsh plugin --profile web add /abs/path/to/thoughtdag/dsh

# 3. restart the profile's web app; open the view switch in the GUI
```

While developing, the profile keeps a pnpm *link* to this directory, so edits
to `lib/` apply on the next restart without reinstalling.

License: MIT
