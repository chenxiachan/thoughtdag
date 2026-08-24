# ThoughtDAG Context Intervention Benchmark

Graph-shaped context operations, measured. When wrong, outdated or irrelevant information propagates through a multi-turn conversation, how much answer quality do explicit pruning and recomputation recover — and how does that recovery decay with propagation depth?

Start at `DESIGN.md` for the full experimental design; the published report lives at [chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2](https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2/). All numbers are **pilot / reference results**, never an authoritative leaderboard.

Two layers, two evidence duties: the **scientific core** (Repair: Pollute → Propagate → Prune, paired depth families) and the **scenario suite** (branch-merge, condense demos). Never one leaderboard.

## Layout

- `cases/` + `gold/` — graph cases (nodes, edges, conditions as graph ops) and exact-match answer keys
- `suites/` — case lists per tier (`pilot-v1` = 9 families × 3 depths = 27 cases, 135 conditions)
- `runs/<run_id>/` — one directory per model endpoint: `envelope.json` (provider, model id, decoding, reasoning mode — the identity record), `traces/` (immutable capture: exact serialized messages, prompt hash, raw responses, usage, latency), `results.json` (produced only by the scorer)
- `runs/compiled/` — per-condition compile artifacts: messages, token estimates, node-order audit
- `canvases/` — importable ThoughtDAG canvases: inputs per condition, results with model answers written in, and side-by-side story canvases
- `tools/` — the pipeline (see below)
- `models.json` — registry of tested endpoints and candidates

## Pipeline

```
generate → validate.mjs (cross-file semantics) → compile.mjs (via the PRODUCT's
buildContext, token-parity enforced) → equivalence.mjs (product node order vs an
independent reference compiler) → run-capture.mjs (capture-only traces)
→ score.mjs (declarative scorer, zero-API rescoring) → canvases.mjs
```

Key properties: conditions are graph transformations (never hand-picked message lists); traces hold immutable facts and are never edited; `score.mjs` is the only producer of results and can re-score every run without an API call; the statistical unit is the **family** (depth variants are paired repeated measures).

## Reproduce

```bash
# re-score any captured run from its traces — zero API calls
BENCH_SUITE=pilot-v1 node tools/score.mjs pilot-v1-nemotron-nano-9b

# re-run the full validation chain
node tools/validate.mjs && node tools/compile.mjs && node tools/equivalence.mjs

# capture a new endpoint: write runs/<id>/envelope.json, then
BENCH_SUITE=pilot-v1 node tools/run-capture.mjs <run_id>
```

Naming note: the task suite is the frozen `pilot-v1` set (9 families × 3 depths); "Pilot v2" names the second REPORT revision with the added endpoint wave. Suite ids never change once captured runs reference them.

Requires the repo root's `node_modules` (the compiler is the product's own `buildContext`, bundled via esbuild) and, for new captures only, the key named by the envelope's `key_env` in `.env`.

## Contribute

- [Suggest the next model](https://github.com/chenxiachan/thoughtdag/issues/new?template=suggest-next-model.yml) if an endpoint would add a useful comparison to the panel.
- [Contribute an endpoint result or contamination case](https://github.com/chenxiachan/thoughtdag/issues/new?template=contribute-benchmark.yml) to start a provenance and validation review.

Do not include API keys, private endpoint details, private conversation data, or other secrets. Accepted results and cases must pass the benchmark's existing schema, provenance, compilation, equivalence, and scoring checks before they enter the public dataset.

## Status

- Reference gate closed 2026-08-16 (five audit rounds); pilot approved and captured.
- Wave 1 (2026-08-16): glm-4.5-flash, nemotron-3.5-lightning, gemma-4-26b, gpt-oss-20b — 540 conditions, 0 capture failures.
- Wave 2 (2026-08-19): nemotron-3-nano-omni-30b-reasoning, nemotron-3-nano-30b, nemotron-nano-9b. 405 conditions, 0 capture failures. The two 30B endpoints are an EXPLORATORY comparison, not a reasoning ablation: they differ in modality stack and reasoning was provider-default on both. glm-5.2 and gemma-4-31b completed 2026-08-22 (both 135/135). A controlled reasoning ablation (one text-only endpoint, reasoning toggled per request, 270 runs) completed 2026-08-21.
- Registered predictions and their outcomes are recorded in `STATUS.md`.
