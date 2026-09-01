# How the context graph works

## Wires are context

In ThoughtDAG, a wire is not decoration. When you ask from a node, incoming structural paths determine which upstream conversations and materials are compiled into the model request.

```text
Evidence A ─┐
            ├─→ Current conclusion ─→ Next question
Evidence B ─┘
```

After disconnecting `Evidence B → Current conclusion`, Evidence B remains on the canvas. You can continue exploring from it or reconnect it later, but it has been removed from this path's **model context**. Questions continued from “Current conclusion” no longer send Evidence B to the model.

## Why a DAG

- **Directed:** context flows from earlier material and reasoning toward later questions.
- **Acyclic:** a node cannot recursively include itself in its own history.
- **Branchable:** alternatives can be explored without overwriting the original path.
- **Mergeable:** selected evidence paths can explicitly meet in one synthesis.

## Canvas-visible is not model-visible

| State | Meaning |
|---|---|
| Canvas-visible | You can still inspect and reconnect the content. |
| Model-visible | The content is selected by the current context paths and included in this request. |

This distinction preserves discarded ideas, old assumptions, and failed experiments without forcing them into later answers.

## What this does and does not explain

ThoughtDAG can inspect and change **what the model received**. It cannot prove **why the model internally produced a particular answer**. Input provenance and internal causal explanation are different problems.

Workflow canvases often use wires for execution order or data dependencies. ThoughtDAG's core wires represent model-visible context. If runtime execution is added, execution state should remain distinguishable from context dependency.

For external agent sessions, see [Session Atlas](/guides/session-atlas): it creates a read-only source mirror, not an in-place editor for the original log.

## From an interaction rule to a testable intervention

“Wires change what the model receives” is not only an interface rule. It can be tested under controlled conditions. ThoughtDAG's **Context Intervention Benchmark** propagates an erroneous claim through several turns, then compares source-only pruning, contaminated-subgraph removal, and dependency-ordered recomputation. The final question and scoring rule stay fixed; the context state changes.

- [Read the interactive context-repair case](https://chenxiachan.github.io/thoughtdag/stories/context-repair/)
- [Review the Pilot v2 methods, results, and limits](https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v2/)
- [Inspect the reproducible benchmark, traces, and scoring pipeline](https://github.com/chenxiachan/thoughtdag/tree/main/benchmark)
