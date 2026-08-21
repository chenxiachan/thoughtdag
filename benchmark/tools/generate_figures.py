#!/usr/bin/env python3
"""Generate publication figures for the Context Repair Pilot article."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Patch


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "figures"
CASE_ID = "rp-pilot-depot-crates-k3"

RUNS = [
    # (display name, short name for tight annotations, results path)
    ("Nemotron 3.5 Lightning", "N3.5-Light", ROOT / "benchmark/runs/pilot-v1-nemotron35l/results.json"),
    ("GLM 4.5 Flash", "GLM-Flash", ROOT / "benchmark/runs/pilot-v1-glm45flash-2026-08-16/results.json"),
    ("GPT-OSS 20B", "GPT-OSS", ROOT / "benchmark/runs/pilot-v1-gptoss20b/results.json"),
    ("Gemma 4 26B (MoE)", "Gemma-26B", ROOT / "benchmark/runs/pilot-v1-gemma4-26b/results.json"),
    ("Nemotron-3 30B Omni reasoning", "N3-30B-R", ROOT / "benchmark/runs/pilot-v1-nemotron3-nano30b-reasoning/results.json"),
    ("Nemotron-3 30B", "N3-30B", ROOT / "benchmark/runs/pilot-v1-nemotron3-nano30b/results.json"),
    ("Nemotron Nano 9B", "N-9B", ROOT / "benchmark/runs/pilot-v1-nemotron-nano-9b/results.json"),
]
SHORT = {name: short for name, short, _ in RUNS}

INK = "#172033"
MUTED = "#667085"
GRID = "#E4E7EC"
PAPER = "#FCFCFD"
BLUE = "#3B82F6"
GREEN = "#16A34A"
GREEN_BG = "#DCFCE7"
RED = "#DC2626"
RED_BG = "#FEE2E2"
ORANGE = "#EA580C"
ORANGE_BG = "#FFEDD5"
GRAY_BG = "#F2F4F7"


def load_results() -> dict[str, list[dict]]:
    return {name: json.loads(path.read_text()) for name, _, path in RUNS}


def by_case(rows: list[dict]) -> dict[str, dict[str, dict]]:
    grouped: dict[str, dict[str, dict]] = {}
    for row in rows:
        grouped.setdefault(row["case_id"], {})[row["condition"]] = row
    return grouped


def repair_counts(results: dict[str, list[dict]]) -> dict[str, dict[str, tuple[int, int]]]:
    strategies = ["source_prune", "subgraph_prune", "recompute_descendants"]
    output: dict[str, dict[str, tuple[int, int]]] = {}
    for model, rows in results.items():
        grouped = by_case(rows)
        eligible = [
            item for item in grouped.values()
            if item["clean"]["answer_correct"] and not item["polluted"]["answer_correct"]
        ]
        output[model] = {
            strategy: (sum(bool(item[strategy]["answer_correct"]) for item in eligible), len(eligible))
            for strategy in strategies
        }
    return output


def flagship_answers(results: dict[str, list[dict]]) -> dict[str, dict[str, str]]:
    return {
        model: {
            row["condition"]: str(row["answer_extracted"])
            for row in rows
            if row["case_id"] == CASE_ID
        }
        for model, rows in results.items()
    }


def base_style() -> None:
    plt.rcParams.update({
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.titleweight": "bold",
        "axes.labelcolor": INK,
        "text.color": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.edgecolor": GRID,
        "figure.facecolor": PAPER,
        "axes.facecolor": PAPER,
        "savefig.facecolor": PAPER,
    })


def save(fig: plt.Figure, name: str) -> None:
    fig.savefig(OUT / name, dpi=150, bbox_inches="tight", pad_inches=0.22)
    plt.close(fig)


def draw_node(ax, x: float, y: float, label: str, face: str, edge: str, width: float = 0.92) -> None:
    patch = FancyBboxPatch(
        (x - width / 2, y - 0.25), width, 0.5,
        boxstyle="round,pad=0.04,rounding_size=0.10",
        facecolor=face, edgecolor=edge, linewidth=1.35,
    )
    ax.add_patch(patch)
    ax.text(x, y, label, ha="center", va="center", fontsize=9.4, fontweight="bold", color=INK)


def draw_chain(ax, y: float, nodes: list[tuple[str, str, str]]) -> None:
    start, end = 3.55, 9.35
    if len(nodes) == 1:
        xs = [(start + end) / 2]
    else:
        step = (end - start) / (len(nodes) - 1)
        xs = [start + i * step for i in range(len(nodes))]
    for i, (label, face, edge) in enumerate(nodes):
        draw_node(ax, xs[i], y, label, face, edge)
        if i < len(nodes) - 1:
            ax.add_patch(FancyArrowPatch(
                (xs[i] + 0.49, y), (xs[i + 1] - 0.49, y),
                arrowstyle="-|>", mutation_scale=10, linewidth=1.1, color="#98A2B3",
            ))


def figure_flagship(answers: dict[str, dict[str, str]]) -> None:
    fig, ax = plt.subplots(figsize=(12.0, 7.1))
    ax.set_xlim(0, 14.2)
    ax.set_ylim(-0.55, 5.35)
    ax.axis("off")

    fig.suptitle("Same final question. Five different context graphs.", x=0.06, y=0.975,
                 ha="left", fontsize=21, fontweight="bold", color=INK)
    ax.text(0.05, 5.03, "Flagship case: 4 crates × 24 verified parts + 11 loose parts = 107",
            fontsize=11.5, color=MUTED)

    rows = [
        ("Clean", "verified chain", [
            ("24", GREEN_BG, GREEN), ("96", GREEN_BG, GREEN),
            ("107", GREEN_BG, GREEN), ("state", GREEN_BG, GREEN), ("ask", GRAY_BG, MUTED),
        ]),
        ("Polluted", "error propagates", [
            ("24", GREEN_BG, GREEN), ("false 30", RED_BG, RED),
            ("120", ORANGE_BG, ORANGE), ("131", ORANGE_BG, ORANGE),
            ("state", ORANGE_BG, ORANGE), ("ask", GRAY_BG, MUTED),
        ]),
        ("Source prune", "bad source removed", [
            ("24", GREEN_BG, GREEN), ("120", ORANGE_BG, ORANGE),
            ("131", ORANGE_BG, ORANGE), ("state", ORANGE_BG, ORANGE), ("ask", GRAY_BG, MUTED),
        ]),
        ("Subgraph prune", "contaminated descendants\nremoved", [
            ("24", GREEN_BG, GREEN), ("ask", GRAY_BG, MUTED),
        ]),
        ("Recompute", "descendants rebuilt in order", [
            ("24", GREEN_BG, GREEN), ("96′", GREEN_BG, GREEN),
            ("107′", GREEN_BG, GREEN), ("state′", GREEN_BG, GREEN), ("ask", GRAY_BG, MUTED),
        ]),
    ]
    cond_keys = ["clean", "polluted", "source_prune", "subgraph_prune", "recompute_descendants"]
    ys = [4.25, 3.3, 2.35, 1.4, 0.45]

    ax.text(0.05, 4.78, "GRAPH STATE", fontsize=9.5, fontweight="bold", color=MUTED)
    ax.text(11.0, 4.78, "MODEL OUTPUT", fontsize=9.5, fontweight="bold", color=MUTED)

    for (title, subtitle, nodes), key, y in zip(rows, cond_keys, ys):
        ax.text(0.05, y + 0.09, title, fontsize=12.5, fontweight="bold", va="center")
        ax.text(0.05, y - 0.19, subtitle, fontsize=9.2, color=MUTED, va="top", linespacing=1.15)
        draw_chain(ax, y, nodes)

        output_values = {model: model_answers[key] for model, model_answers in answers.items()}
        unique = set(output_values.values())
        if len(unique) == 1:
            value = next(iter(unique))
            color = GREEN if value == "107" else RED
            ax.text(11.0, y + 0.02, f"All seven  →  {value}", fontsize=13.2,
                    fontweight="bold", color=color, va="center")
        else:
            good = [SHORT[m] for m, v in output_values.items() if v == "107"]
            bad = [SHORT[m] for m, v in output_values.items() if v != "107"]
            ax.text(11.0, y + 0.13, f"{len(good)} of 7  →  107", fontsize=10.5,
                    fontweight="bold", color=GREEN, va="center")
            ax.text(11.0, y - 0.17, f"{', '.join(bad)}  →  131", fontsize=9.0,
                    fontweight="bold", color=RED, va="center")

        if y > 0.5:
            ax.plot([0.05, 14.0], [y - 0.48, y - 0.48], color=GRID, linewidth=0.8)

    legend = [
        Patch(facecolor=GREEN_BG, edgecolor=GREEN, label="verified / rebuilt"),
        Patch(facecolor=RED_BG, edgecolor=RED, label="false source"),
        Patch(facecolor=ORANGE_BG, edgecolor=ORANGE, label="contaminated descendant"),
    ]
    ax.legend(handles=legend, loc="lower left", bbox_to_anchor=(0.0, -0.095), ncol=3,
              frameon=False, fontsize=9.5, handlelength=1.4)
    ax.text(14.0, -0.25, "Pilot / reference result", ha="right", fontsize=9, color=MUTED)
    save(fig, "flagship-context-repair.png")


def figure_repair_rates(counts: dict[str, dict[str, tuple[int, int]]]) -> None:
    order = ["source_prune", "recompute_descendants", "subgraph_prune"]
    labels = ["Delete source only", "Delete source + recompute", "Delete contaminated subgraph"]
    colors = [ORANGE, BLUE, GREEN]
    totals = []
    for strategy in order:
        repaired = sum(model[strategy][0] for model in counts.values())
        eligible = sum(model[strategy][1] for model in counts.values())
        totals.append((repaired, eligible))
    rates = [100 * n / d for n, d in totals]

    fig, ax = plt.subplots(figsize=(10.3, 5.6))
    y = list(range(len(labels)))
    ax.barh(y, rates, color=colors, height=0.56)
    ax.set_yticks(y, labels, fontsize=11.5)
    ax.invert_yaxis()
    ax.set_xlim(0, 104)
    ax.set_xlabel("Recovery rate among cases first derailed by pollution (%)", labelpad=10)
    ax.set_title("Repairing the consequences mattered more than deleting the source", loc="left", fontsize=17, pad=21)
    total_eligible = sum(model["source_prune"][1] for model in counts.values())
    ax.text(0, 1.025, f"{total_eligible} paired model-cases across seven endpoints", transform=ax.transAxes,
            color=MUTED, fontsize=10.5)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    for yi, rate, (n, d) in zip(y, rates, totals):
        ax.text(rate + 1.0, yi, f"{n}/{d}  ·  {rate:.1f}%", va="center", ha="left",
                fontsize=11.5, fontweight="bold", color=INK)
    fig.text(0.91, 0.025, "Pilot / reference results. Exact-match scoring; no LLM judge.",
             ha="right", fontsize=9.2, color=MUTED)
    fig.subplots_adjust(left=0.27, right=0.91, top=0.78, bottom=0.27)
    save(fig, "repair-strategy-results.png")


def figure_model_matrix(counts: dict[str, dict[str, tuple[int, int]]]) -> None:
    models = [name for name, _, _ in RUNS]
    strategies = ["source_prune", "subgraph_prune", "recompute_descendants"]
    labels = ["Source only", "Whole subgraph", "Recompute"]
    matrix = [[counts[model][strategy][0] for strategy in strategies] for model in models]

    cmap = LinearSegmentedColormap.from_list("repair", ["#FDE2E2", "#FFF3D6", "#DDF7E7", "#8DDFAC"])
    fig, ax = plt.subplots(figsize=(9.7, 7.6))
    image = ax.imshow(matrix, cmap=cmap, vmin=14, vmax=18, aspect="auto")
    del image
    ax.set_xticks(range(len(labels)), labels, fontsize=11)
    ax.set_yticks(range(len(models)), models, fontsize=11)
    ax.tick_params(length=0)
    ax.set_title("Residual context separated the models in this pilot", loc="left", fontsize=17, pad=28)
    ax.text(0, 1.04, "Successful repairs out of 18 cases that were first derailed",
            transform=ax.transAxes, color=MUTED, fontsize=10.5)
    for i, row in enumerate(matrix):
        for j, value in enumerate(row):
            ax.text(j, i, f"{value}/18", ha="center", va="center", fontsize=14,
                    fontweight="bold", color=INK)
    for x in range(len(labels) + 1):
        ax.axvline(x - 0.5, color=PAPER, linewidth=5)
    for y in range(len(models) + 1):
        ax.axhline(y - 0.5, color=PAPER, linewidth=5)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.text(1.0, -0.17, "Descriptive pilot result, not a general model ranking.",
            transform=ax.transAxes, ha="right", fontsize=9.2, color=MUTED)
    fig.subplots_adjust(left=0.25, right=0.97, top=0.76, bottom=0.22)
    save(fig, "model-repair-matrix.png")


def main() -> None:
    base_style()
    results = load_results()
    counts = repair_counts(results)
    figure_flagship(flagship_answers(results))
    figure_repair_rates(counts)
    figure_model_matrix(counts)


if __name__ == "__main__":
    main()
