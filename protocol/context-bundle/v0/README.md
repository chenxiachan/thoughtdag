# Context Bundle v0

> **Status: PROPOSAL.** Field names and semantics are unstable until the
> fixtures in `fixtures/` freeze them. Nothing here is a compatibility
> promise yet.

A Context Bundle is the compiled, portable answer to one question:

> **What should the target model see next, and where did each piece come from?**

It is the output of ThoughtDAG's context compiler — the same `buildContext`
that assembles every in-app generation — wrapped with identity, provenance
and hashes. It never impersonates any runner's native session file.

## The determinism contract

The v0 acceptance test, and the reason this format is trustworthy:

- The same **semantic graph snapshot** with the same **compile options**
  produces **byte-identical** bundle output.
- Volatile inputs (the clock) are injected by the caller, never sampled.
- `id` derives from the content hash; `integrity.content_hash` covers the
  whole body except `id`, `created_at` and `provenance`.
- `graph.snapshot_hash` covers only what can change what a model sees —
  positions, sizes, collapse and other view states are excluded. Moving a
  card is not a new thought.

## Provenance

Every message item carries a `source`: which layer produced it
(`system | material | reference | chain | branch`), which node, and — for
rendered attachments — which attachment. `context.materials` lists every
attachment that reached the model channel, with its projection mode
(`extracted_text`, `pixels`, both, or `placeholder`).

## Honest v0 simplifications (vs. the full design)

- **No `tool_exchange` items yet** — the canvas records no tool calls of
  its own; those arrive with the session importers.
- **Materials carry a dedup `fingerprint`** (`name|size|head`), not a
  cryptographic digest — vaulted payloads may not be in memory at compile
  time. A later version upgrades this to sha256 artifact references.
- **`selection.mode` is always `full`** — v0 compiles what the graph wires
  in; partial selections come later.
- Continuity Manifest and Run Bundle are separate (future) documents; this
  format only describes the next turn's input.

## Files

- `schema.json` — JSON Schema (draft 2020-12) for the format.
- `fixtures/*.graph.json` — small semantic graphs (nodes + edges + target).
- `fixtures/*.bundle.json` — the expected compiler output for each graph,
  compiled with the fixed clock `2026-01-01T00:00:00Z`. Regenerating them
  must be a conscious act: a diff here is a protocol change.

Compiler implementation: `src/lib/context-bundle.ts`.
