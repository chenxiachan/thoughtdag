# ThoughtDAG Context Control Benchmark — Design (v3)

Status: published with the pilot (see README.md and the report page). Originally drafted 2026-08-16 as a pre-registration (v3 after third review: two-layer split); kept as written — deviations and outcomes are recorded in STATUS.md.

## Two layers, two evidence duties (v3 restructure)

The folder holds two distinct projects that must never share one leaderboard:

1. **Scientific core — the Context Repair Benchmark** (Track C only). A narrow, paper-grade research question with paired objective metrics. This is the leaderboard, the SEO engine, the publication.
2. **Context Operations Scenario Suite** (Tracks A and B). Product-capability scenarios, benchmark extensions, visual demos, and future standalone research questions. Valuable, but a different evidence duty; never merged into the core table, never all in the first article.

## Core research question (narrowed)

> **After wrong, outdated or irrelevant information propagates through a multi-turn conversation, how much answer quality do explicit context pruning and recomputation recover, and how does that recovery decay with propagation depth?**

The measured object is **model × pollution type × repair strategy × propagation depth**. Same model, same question, same material; only the repair intervention changes. The leaderboard narrative: which model is easiest to derail; which recovers best once the wire is cut; after how many turns is cutting the source no longer enough.

**Honest scope boundary** (stated up front, in every publication):
- The automated benchmark can show that *graph-shaped context operations* have value.
- It cannot by itself show that only the ThoughtDAG UI can realize them. ThoughtDAG's claim is to be the visual, editable, replayable **reference implementation** of these interventions.
- Proving the UI beats linear chat for humans requires a separate HCI experiment (event-log instrumented; out of scope for v1).

## Scientific core — Repair (Pollute → Propagate → Prune)

Conditions per item: `clean`, `polluted@k`, `source_prune@k`, `subgraph_prune@k`, `recompute@k` for propagation depth k ∈ {1, 2, 3} (k = number of frozen contaminated downstream turns). Pollution operators: misinformation / temporal-supersession / irrelevant-distractor.

**Paired primary metrics — all conditioned on clean-correct items** (without this conditioning, "the model never knew" and "the context derailed it" are indistinguishable):
- **Harm rate** = P(polluted wrong | clean correct)
- **Repair rate(strategy, k)** = P(repaired correct | clean correct AND polluted wrong)
- **Residual contamination(k)** = P(source_prune wrong | clean correct AND polluted wrong) — the cost of frozen descendants
- **Propagation decay** = repair rate as a function of k, per strategy

## Scenario suite (extension layer)

### Track A — branch-merge (Explore → Select → Merge)

RQ: when a question needs several directions explored, do branch isolation and selective merging beat keeping the whole linear history?

Graph: research question + branch A (necessary evidence) + branch B (necessary evidence) + branch C (plausible but irrelevant) [+ C' variant: conflicting].

Conditions (per case):
| id | context | tests |
|----|---------|-------|
| `single_branch` | A only | insufficiency behavior (exploratory metric only, see Scoring) |
| `linear_all` | A+B+C | full-history baseline |
| `linear_all_padded` | A+B+neutral filler, token-matched to linear_all | **length control** — separates "shorter" from "cleaner" |
| `selected_merge` | A+B | the gold merge |
| `wrong_merge_irrelevant` | A+C | bad merge, distractor type |
| `wrong_merge_conflict` | A+B+C' | bad merge, conflict type |

Review decisions baked in: wrong_merge is **split by pollution type** (irrelevant vs conflict — different literatures, different effects); `linear_all_padded` added as the length control; branch order is **fixed and declared** (A, B, C in node order) to pin the position effect.

Metrics (protocol v2 decomposition — total = content + length):
- **Content gain** = acc(linear_all_padded) − acc(linear_all): benefit of clean content at matched length (compiler enforces token parity ≤5% on this pair, refusing to run otherwise)
- **Length gain** = acc(selected_merge) − acc(linear_all_padded): benefit of dropping useless length, content held clean
- **Total merge gain** = acc(selected_merge) − acc(linear_all) = content gain + length gain
- Merge gain vs insufficiency = acc(selected_merge) − acc(single_branch); Distractor adoption rate (answer contains a C-branch entity)

### Track B — condense (Condense without forgetting)

RQ: after long exploration is condensed, does the model keep valid conclusions and drop superseded ones, at a fraction of the tokens?

Material: research-log style dialogues with a knowledge update (v1 conclusion superseded by v2, with the reason), plus irrelevant exploration turns. Sources: synthetic research logs (v1); LongMemEval knowledge-update/temporal subsets (later, natural track).

Conditions:
| id | context | tests |
|----|---------|-------|
| `raw_full` | everything | baseline |
| `fixed_condense` | frozen reference condensation (keeps v2 + supersession note) | condensation UTILIZATION (fair across models) |
| `dropped_detours` | irrelevant detour nodes removed (a real graph op: remove_node + rewire); gold chain untouched | de-cluttering point on the token-accuracy curve |
| `lossy_condense` | condensation missing the supersession note | negative control, characteristic failure = answering the superseded value |

`self_condense` (model condenses, then answers) is a separate END-TO-END lane run by the harness, never mixed into the same leaderboard column — it measures condensation ability × utilization (a product, not a factor).

Metrics: final accuracy; gold-fact retention; stale-fact adoption rate (answered the superseded value); token reduction. Protocol v2: raw_full → dropped_detours → fixed_condense form a **three-point token-accuracy curve** (tokens reported per point, not forced equal; forcing equality between a pruned chain and a distill node is structurally impossible and was dropped after the first audit). The de-cluttering vs re-organization distinction reads off the curve.

### Track C — repair (the scientific core; see above)

Material: symbolic arithmetic DAGs (GSM-DC style, program-generated, objectively scorable). Pollution = a confident false "correction" turn. Downstream turns are **frozen replay text** already contaminated by it (controlled replay: every model reads the same history; decided over live generation for reproducibility and cost). Reference items exist at k=1 (rp-ref-0001-k1), k=2 (rp-ref-0001), k=3 (rp-ref-0001-k3).

Conditions:
| id | context | tests |
|----|---------|-------|
| `clean` | no pollution turn | baseline |
| `polluted` | pollution + contaminated B, C | harm rate / adoption |
| `source_prune` | pollution turn removed; contaminated B, C remain | is deleting the source enough? (residual contamination) |
| `subgraph_prune` | pollution + B + C all removed | full excision recovery |
| `recompute_descendants` | pollution removed; B, C regenerated live in dependency order | the staleness+replay mechanism, measured |

Metrics: harm rate; repair rate per strategy; residual contamination (source_prune vs clean gap); recovery by propagation depth (case variants with 1, 2, 3 contaminated turns).

## Scoring

- Objective answers only: numeric or single fictional-entity exact match after normalization. **No LLM judge anywhere in v1.**
- Fictional entities throughout Track A (and where applicable elsewhere) so answers cannot come from parametric memory — a pre-registered construction rule.
- `single_branch` insufficiency: abstention detection by regex is brittle, so sufficiency accuracy is an **exploratory metric only**; headline metrics compare evidence-sufficient conditions.
- Statistical plan: leaderboard = single run, temperature 0 (or provider-pinned equivalent), per-condition paired comparison. Paper tier = power analysis first (expect ≥50–100 items/condition for medium effects), 3 repeats, bootstrap CI + McNemar on paired items.

## Independent reference compiler and the circularity fix (v3)

Using the product's `buildContext` as the only compiler is good dogfood but circular as science (defining interventions in ThoughtDAG to prove ThoughtDAG's interventions work). v3 structure:

```
Canonical graph spec (case.json)
        ↓
Reference compiler (independent, in-folder)   → canonical ordered (role, node) sequence
        ↕  equivalence test (must match)
Product buildContext adapter                   → messages (text rendering)
```

Canonical tie-break (revised after the tie-order unit case): siblings order by the index of their first outgoing edge in the edge array, matching the product's incoming-edge declaration semantics. This divergence was invisible to text back-inference and only surfaced through synthetic structural unit tests — the reason they exist.

Equivalence is defined at the **node-sequence level**: which nodes enter context and in what order. Text rendering (Q/A concatenation, block fencing) is adapter-layer product semantics and deliberately NOT part of the canonical definition — demanding byte equality would just re-couple the reference compiler to the product's renderer. This proves: (1) the experiment is definable without any UI or product; (2) ThoughtDAG correctly implements the benchmark's context semantics; (3) every intervention replays in ThoughtDAG.

Honest external phrasing: *the benchmark measures explicit graph-based context interventions; ThoughtDAG is the visual, editable reference implementation* — never "only ThoughtDAG can do this".

## Conditions are graph transformations (protocol v2, after first audit)

A condition is a list of `graph_ops` (add_edge / remove_edge / remove_node) applied to the case's base graph, plus optional `recompute_nodes`. The compiled message list is derived by the PRODUCT's own `buildContext` walking the transformed graph; the resulting node set and message order are **audit outputs** in the compile artifact, never experiment inputs. This closes the v1 flaw where `include_nodes` hand-picked messages and bypassed the graph engine entirely: v1 could only show "cleaner message sets help"; v2 measures graph-based context interventions (with the product as one verified implementation of them). Unwired nodes stay on the canvas but out of context, which is the product's own semantics.

## Pre-registered construction parameters

- language: en (v1; zh track is a planned extension and a differentiator)
- branch order: fixed A→B→C in message order
- entity_type: fictional (Track A), symbolic (Track C)
- pollution operators: misinformation / temporal-supersession / irrelevant-distractor (the ConflictBank trio, adapted to conversation turns)
- replay: contaminated downstream turns are frozen text, identical for every model
- decoding: temperature 0 where supported; reasoning split into `standard` (off/minimal) and `reasoning` (fixed level) lanes — never mixed in one table

## Cost control

- Suites: `smoke` (5 reference cases: one per scenario track + the three-depth repair family) → `core` (pilot: 7-10 independent families; leaderboard: 20-30; paper: power-analysis-sized) → `paper` (repeats + clustered CIs).
- Runner must implement `--dry-run` printing estimated calls/tokens/cost against a hard budget cap before any paid run.
- Calibration: run 3 cases first, use returned real usage to project the full run. Paper estimates are never trusted over measured usage.
- Matched pairs declared in `construction.matched_pairs` are token-verified at compile time (default tolerance 5%); the compiler refuses to emit a run plan when violated.
- Every run stores a full trace per condition: compiled messages, prompt hash (product's `hashContext`), raw API response with request id, recompute intermediates, scorer version and verdict. A result without its trace is not a result.
- Every result row records: provider, exact model id + revision, reasoning mode, temperature, input/output/cached tokens, cost, currency, run date (see `schema/result.schema.json`).

## Leaderboard presentation (later tier)

**Core board (Repair only)** — columns: Harm rate · Repair rate (source / subgraph / recompute) · Residual contamination · Propagation decay. Plus tokens, cost, failure rate, exact model version, run date. No composite score. The Scenario Suite (branch-merge, condense) publishes as separate demo pages, never merged into the core table (two layers, two evidence duties). Every score links to an openable `.thoughtdag.json` canvas: same model, same question, one different wire. Case detail page: original vs intervened graph, which nodes entered context, messages diff, answers side by side, download canvas.

## Pipeline (compile / run / score / canvases operational; generator still gated)

1. `validate` — schemas, gold separation, data hashes
2. `compile` — ThoughtDAG's own `buildContext` turns case graphs into messages (the product is the compiler); emits per-condition `.thoughtdag.json` canvases
3. `run` — provider calls, cache key = case_hash + condition + model_id + decoding + compiler_version + scorer_version
4. `score` — deterministic
5. `publish` — results, story canvases, leaderboard data

Runner framework: decide at reference-case stage between Inspect AI (academic log credibility, Python) and the existing in-repo AI SDK provider layer (single language, ten providers already wired, incl. CN models). Log format follows Inspect's schema either way.

## Story canvases (v3 narrative form)

One `story.thoughtdag.json` per case, read left to right as a single experiment: how it should go → the pollution lands → cut the source (residue?) → cut the subgraph → recompute. Frames carry narrative titles with verdicts, not condition ids. Note an honest representational limit: node deletion cannot be depicted inside one continuous graph (the deleted node is absent by definition), so the story uses ordered, verdict-labeled panels rather than pretending a single mutating graph.

## Statistical unit (v3.1)

The **family** is the independent experimental unit. Depth variants (k=1,2,3) and pollution-type variants within one family are paired repeated measures — never counted as independent samples. Cell-level n equals the number of independent families, and tier sizes are defined in `suites/core-v1.json` (pilot 7-10 / leaderboard 20-30 / paper by power analysis). Analyses cluster or pair by family.

## Reference acceptance gate (closed 2026-08-16)

Five reference cases (branch-merge, condense, and the three-depth repair family) run end to end, score objectively via the declarative scorer, pass semantic validation and node-sequence equivalence, and open in ThoughtDAG as canvases. Pipeline order: generate → validate semantics → compile → equivalence → run → score → canvases. Core generation approved at pilot tier; story-canvas visual sign-off remains a publication gate, not a generation gate.
