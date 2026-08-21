# Benchmark STATUS

Last updated: 2026-08-16. Pilot / reference results only; never an authoritative leaderboard.

## Pilot v1 cross-model comparison — COMPLETE (4 models × 135 conditions each, zero capture failures)

Models (all via free endpoints, temperature 0, provider-default reasoning):
glm-4.5-flash (Zhipu direct) · nvidia/nemotron-3.5-lightning:free · google/gemma-4-26b-a4b-it:free · openai/gpt-oss-20b:free (OpenRouter).

Scoring: scorer 3.1.0, compiler 2.0.0, suite pilot-v1 (9 families × 3 depths, paired). All metrics conditioned on clean-correct. Rescore any time with `BENCH_SUITE=pilot-v1 node tools/score.mjs <run_id>` (zero API).

### Finding 1 — Harm is identical across all four vendors
Every model: clean 27/27; harm 18/27 = misinformation 9/9, temporal-supersession 9/9, distractor 0/9.
Conflicting information always derails; numerically-similar irrelevant asides never do. Cross-vendor replication is exact, cell for cell.

### Finding 2 — Repair-strategy hierarchy, with a depth gradient on source_prune
Pooled repair (72 derailed cells across models): subgraph_prune 72/72 · recompute_descendants 71/72 · source_prune 68/72.
All four source_prune failures are temporal-supersession at k≥2. Gemma shows the clean gradient: k1 6/6 → k2 5/6 → k3 4/6.

| model | source_prune | subgraph_prune | recompute | repair total |
|---|---|---|---|---|
| nemotron-3.5-lightning | 18/18 | 18/18 | 18/18 | 54/54 |
| glm-4.5-flash | 18/18 | 18/18 | 17/18 (library-shelves k3 → 22) | 53/54 |
| gpt-oss-20b | 17/18 (depot-crates k3 → 131) | 18/18 | 18/18 | 53/54 |
| gemma-4-26b | 15/18 (lab-samples k2,k3 → 78; depot-crates k3 → 131) | 18/18 | 18/18 | 51/54 |

### Finding 3 — Flagship DAG: depot-crates k3 (case-level cross-vendor replication)
Two different vendors' models (gemma-4-26b, gpt-oss-20b) fail the same cell with the same wrong number: source pruned, yet both answer 131 = 4×30+11 — the stale v1 value survives via the contaminated replay chain. subgraph_prune restores 107 for both. "Same question. One different wire."
Story canvas: `canvases/results/rp-pilot-depot-crates-k3.story.thoughtdag.json` (Gemma run). Result canvases for all 27 pilot cases generated from pilot-v1-gemma4-26b.


## Wave 2 — controlled pairs (2026-08-19), 3 of 5 complete

New free endpoints chosen as PAIRS (one variable each), 135 conditions apiece, zero capture failures:
- nemotron-3-nano-30b-a3b-reasoning vs nemotron-3-nano-30b-a3b (reasoning on/off, same vendor+size+arch)
- nemotron-nano-9b-v2 (scale-down axis)
- IN PROGRESS: z-ai/glm-5.2:free (generation pair vs glm-4.5-flash), google/gemma-4-31b-it:free (dense pair vs 26b MoE) — free-tier rate limits + one provider 400-bug (OpenRouter routing, "Unknown name labels"); detached grinder running.

### Findings (seven models, 126 derailed cells)
1. Harm three-way split now SEVEN for seven (mis 9/9, temp 9/9, dis 0/9 every model).
2. Aggregate repair: subgraph 126/126 · recompute 125/126 · source-only 116/126. 9 of 10 source-prune failures are temporal-supersession.
3. REGISTERED PREDICTIONS BOTH REFUTED: (a) reasoning does NOT protect against residual contamination — reasoning twin 14/18 vs sibling 16/18, and produced the only mis-type source-prune failure ever observed; (b) 9B did NOT break the clean ceiling — 27/27 clean and perfect 54/54 repair. Repair robustness tracks neither scale, vendor, nor reasoning mode.
4. depot-crates k1/k3 → 131 is now a cross-model attractor (4 models produce the identical wrong number).

Report page updated locally (website/research/context-repair-pilot-v1/index.html) — NOT yet committed; user review pending.

## Gates before anything public
1. Human visual sign-off on story canvases (open in ThoughtDAG).
2. benchmark/ into git; models.json VERIFY (ids checked, README numbers current).
3. First article drafts from depot-crates k3; label all numbers "Pilot / reference results".

## Cost note
Entire 4-model pilot ran at $0 (free tiers). Measured pilot usage ≈30K in / 94K out tokens per model (thinking-mode upper bound).
