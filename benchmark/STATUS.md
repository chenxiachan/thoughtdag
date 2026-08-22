# Benchmark STATUS

Last updated: 2026-08-21. Pilot / reference results only; never an authoritative leaderboard. The benchmark and the v2 report are PUBLIC (repo + chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2/).

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


## Wave 2 (2026-08-19), 3 of 5 complete

New free endpoints, 135 conditions apiece, zero capture failures:
- nemotron-3-nano-omni-30b-a3b-reasoning and nemotron-3-nano-30b-a3b (an EXPLORATORY same-vendor comparison; see the correction below)
- nemotron-nano-9b-v2 (scale-down axis)
- COMPLETED 2026-08-22: z-ai/glm-5.2:free (generation pair) and google/gemma-4-31b-it:free (dense pair), both 135/135 after multi-day free-tier grinding. BOTH PERFECT (54/54 repair, harm split identical). The 26B MoE depth gradient does NOT appear in the dense sibling; within this family the fragility belongs to the MoE variant alone. Nine-endpoint aggregate: harm split 9/9 endpoints; repair subgraph 162/162, recompute 161/162, source-only 152/162.

### CORRECTION 2026-08-21: the 30B comparison is not a reasoning ablation
The wave-2 design intended a reasoning on/off pair. A user audit caught two flaws before they hardened. First, the endpoints are different models, not one model with a switch: the reasoning endpoint is the OMNI variant (ships vision and speech encoders per the NVIDIA model card); its sibling is text-only. Second, both envelopes record provider-default reasoning, so reasoning was never explicitly toggled on either side. Every "reasoning twin / reasoning on-off / reasoning amplifies residual context" claim was therefore withdrawn from the report, READMEs and models.json on 2026-08-21. The observation itself stands as exploratory: 14/18 vs 16/18 source-only recovery.

### ABLATION RESULT 2026-08-21: reasoning protects repair
Runner extended (envelope.request_extra merges per-request body fields). One text-only model (nemotron-3-nano-30b-a3b:free), 135 conditions twice, reasoning:{enabled:true|false}. Toggle probe-verified and audited across all calls (28,187 reasoning tokens ON, 0 OFF).
- Harm identical both sides (18/27, three-way split unchanged): reasoning does not prevent derailment.
- source_prune: 16/18 ON vs 2/18 OFF. The registered prediction (reasoning protects against residual contamination) is SUPPORTED by the valid test.
- subgraph_prune: 18/18 ON vs 15/18 OFF. The three OFF failures are bare-arithmetic slips in the clean-but-shorter C0-prime state (e.g. concatenating 96 and 9 into 969): deletion restores cleanliness, not the work.
- recompute: 18/18 both sides. For a non-reasoning model the strategy hierarchy reorders: recompute > subgraph > source.
- Wave-2 confusion explained: the "non-reasoning" endpoint reasons by default (97 tokens in the probe), so the invalid comparison pointed the wrong way.
Runs: ablation-nano30b-think-on / ablation-nano30b-think-off.

### Findings (seven endpoints, 126 derailed cells)
1. Harm three-way split now SEVEN for seven (mis 9/9, temp 9/9, dis 0/9 every endpoint).
2. Aggregate repair: subgraph 126/126 · recompute 125/126 · source-only 116/126. 9 of 10 source-prune failures are temporal-supersession.
3. Registered predictions: (a) "reasoning protects against residual contamination" could NOT be validly tested (see correction above); (b) "9B breaks the clean ceiling and repairs worse" REFUTED: 27/27 clean and perfect 54/54 repair. Repair robustness tracks neither parameter count nor vendor.
4. depot-crates k1/k3 → 131 is a cross-endpoint attractor (4 endpoints produce the identical wrong number).

Report v2 published 2026-08-21 (website/research/context-repair-pilot-v2/; v1 kept as an archived snapshot).

## Remaining gates
1. Human visual sign-off on story canvases (open in ThoughtDAG) — still pending.
4. First standalone article from depot-crates k3; label all numbers "Pilot / reference results".

## Cost note
Entire 4-model pilot ran at $0 (free tiers). Measured pilot usage ≈30K in / 94K out tokens per model (thinking-mode upper bound).
