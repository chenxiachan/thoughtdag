# ThoughtDAG vibe marketing campaign

This campaign uses **Postiz Agent** as the execution layer and keeps strategy,
community participation, and final approval human-controlled.

## Why Postiz

| Candidate | Best at | Fit for ThoughtDAG now |
| --- | --- | --- |
| Postiz / Postiz Agent | Multi-platform drafts, scheduling, media, analytics | **Selected:** directly removes the distribution bottleneck |
| Umami | Privacy-friendly first-party analytics | Useful later; it measures but does not distribute |
| Activepieces | General workflow automation | Too broad for the current campaign |
| Automatisch | Trigger/action automation | Less active and less social-specific |
| Mixpost | Self-hosted social scheduling | Simpler, but fewer integrations and a smaller active ecosystem |

Postiz is AGPL-3.0, self-hostable, and supports Reddit, X, LinkedIn, Bluesky,
Mastodon, DEV, Hashnode, and other channels. The campaign intentionally leaves
Reddit and community sites in manual mode.

## Files

- `campaign.json` — positioning, guardrails, campaign gate, channel-specific copy
- `postiz-drafts.mjs` — dry-run or create **drafts only** in Postiz
- `github-snapshot.mjs` — owner-side GitHub traffic and Star snapshot

Existing ThoughtDAG assets are reused:

- `docs/prune-en.gif`
- `public/covers/cover-cut-edge.png`
- `public/covers/cover-wires-context.png`

## 1. Run the campaign dry-run

```bash
node marketing/vibe-thoughtdag/postiz-drafts.mjs
node marketing/vibe-thoughtdag/postiz-drafts.mjs --post x-delete-one-wire
```

No network request or publishing occurs in dry-run mode.

## 2. Connect Postiz

Use Postiz Cloud or a self-hosted Postiz instance. The CLI supports a custom
endpoint through `POSTIZ_API_URL`.

```bash
npm install -g postiz
postiz auth:login
postiz integrations:list
```

Export only the integrations that will be used:

```bash
export POSTIZ_INTEGRATION_X="..."
export POSTIZ_INTEGRATION_BLUESKY="..."
export POSTIZ_INTEGRATION_LINKEDIN="..."
```

Do not put API keys or integration IDs in this repository.

## 3. Create drafts after the gate

All owned-account posts start as `gated`. Meet at least two signals defined in
`campaign.json`, change the reviewed post status to `ready`, then create a draft:

```bash
node marketing/vibe-thoughtdag/postiz-drafts.mjs \
  --post x-delete-one-wire \
  --create-drafts
```

For an explicitly approved exception, `POSTIZ_GATE_OVERRIDE=1` bypasses the
local gate but still creates a draft rather than publishing.

## 4. Capture attribution evidence

GitHub traffic has a reporting delay. Capture a baseline before each channel and
another snapshot after 24 and 72 hours:

```bash
node marketing/vibe-thoughtdag/github-snapshot.mjs --write
```

The generated `snapshots/` directory is ignored because Star timelines include
public account names and are operational evidence rather than campaign source.

## Operating sequence

1. Publish the `r/LLMDevs` post manually and answer every substantive comment.
2. Wait 24–48 hours and capture GitHub traffic.
3. If the gate passes, create owned-account drafts in Postiz.
4. Publish X/Bluesky first; publish LinkedIn later with the feedback insight.
5. Do not repeat Hacker News until there is a materially new case or release.
6. Treat `r/selfhosted` as a Docker-release channel, not another generic launch.
