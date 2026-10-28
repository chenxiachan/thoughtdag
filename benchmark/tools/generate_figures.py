#!/usr/bin/env python3
"""Generate publication figures for the Context Repair Pilot article.

`python3 generate_figures.py` writes the English figures to benchmark/figures (the
website copies them to website/assets/context-repair-*.png). `python3 generate_figures.py zh`
writes the Chinese ones straight to website/assets/context-repair-*-zh.png.
"""

from __future__ import annotations

import atexit
import json
import shutil
import sys
import tempfile
from pathlib import Path

import matplotlib.font_manager as fm
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
    ("GLM 5.2", "GLM-5.2", ROOT / "benchmark/runs/pilot-v1-glm52/results.json"),
    ("Gemma 4 31B (dense)", "Gemma-31B", ROOT / "benchmark/runs/pilot-v1-gemma4-31b/results.json"),
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

# Every string a figure prints, per language. English is the original wording.
T = {
    "en": {
        "flag_title": "Same final question. Five different context graphs.",
        "flag_sub": "Flagship case: 4 crates × 24 verified parts + 11 loose parts = 107",
        "graph_state": "GRAPH STATE",
        "model_output": "MODEL OUTPUT",
        "rows": [("Clean", "verified chain"), ("Polluted", "error propagates"),
                 ("Source prune", "bad source removed"), ("Subgraph prune", "contaminated descendants\nremoved"),
                 ("Recompute", "descendants rebuilt in order")],
        "false30": "false 30", "state": "state", "ask": "ask",
        "all_nine": "All nine  →  {value}", "some_of_nine": "{n} of 9  →  107",
        "legend": ["verified / rebuilt", "false source", "contaminated descendant"],
        "flag_note": "Pilot / reference result",
        "rate_labels": ["Delete source only", "Delete source + recompute", "Delete contaminated subgraph"],
        "rate_x": "Recovery rate among cases first derailed by pollution (%)",
        "rate_title": "Repairing the consequences mattered more than deleting the source",
        "rate_sub": "{n} paired model-cases across nine endpoints",
        "rate_note": "Pilot / reference results. Exact-match scoring; no LLM judge.",
        "strategies": ["Source only", "Whole subgraph", "Recompute"],
        "matrix_title": "Residual context separated the models in this pilot",
        "matrix_sub": "Successful repairs out of 18 cases that were first derailed",
        "matrix_note": "Descriptive pilot result, not a general model ranking.",
        "abl_ticks": ["Reasoning ON", "Reasoning OFF"],
        "abl_y": "Repaired cases out of 18",
        "abl_title": "One model, one switch: without reasoning,\ndeleting the source stops working",
        "abl_sub": "Nemotron-3 Nano 30B, reasoning toggled per request (28,187 vs 0 reasoning tokens)",
        "abl_note": "Harm was identical on both sides; only repair changed.",
    },
    "zh": {
        "flag_title": "同一个最终问题，五张不同的上下文图",
        "flag_sub": "旗舰案例：4 箱 × 每箱核实 24 个零件 + 11 个散件 = 107",
        "graph_state": "图的状态",
        "model_output": "模型输出",
        "rows": [("干净", "核实过的链条"), ("污染", "错误向下传播"),
                 ("仅删源头", "删掉错误源头"), ("删除子图", "删掉受污染的下游节点"),
                 ("重算下游", "按依赖顺序重建下游")],
        "false30": "错误 30", "state": "状态", "ask": "提问",
        "all_nine": "九个全部  →  {value}", "some_of_nine": "九个中 {n} 个  →  107",
        "legend": ["核实 / 重建", "错误源头", "受污染的下游节点"],
        "flag_note": "试点 / 参考结果",
        "rate_labels": ["仅删除源头", "删除源头并重算下游", "删除污染子图"],
        "rate_x": "先被污染带偏的案例中，修复成功的比例（%）",
        "rate_title": "修复后果，比删除源头更重要",
        "rate_sub": "九个端点上的 {n} 个配对模型案例",
        "rate_note": "试点 / 参考结果。精确匹配评分，不用 LLM 评判。",
        "strategies": ["仅删源头", "删除整个子图", "重算下游"],
        "matrix_title": "这次试点里，区分模型的是残留的上下文",
        "matrix_sub": "18 个先被带偏的案例中修复成功的数量",
        "matrix_note": "描述性的试点结果，不是通用的模型排名。",
        "abl_ticks": ["推理开", "推理关"],
        "abl_y": "18 个案例中修复成功的数量",
        "abl_title": "同一个模型，只拨一个开关：\n关掉推理后，仅删源头几乎失效",
        "abl_sub": "Nemotron-3 Nano 30B，按请求切换推理（推理 token 28,187 对 0）",
        "abl_note": "两边被带偏的情况完全相同，只有修复结果变了。",
    },
}
LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
t = T[LANG]
# Chinese figures go straight to the website under the names the reports use.
ZH_NAMES = {
    "flagship-context-repair.png": "context-repair-flagship-zh.png",
    "repair-strategy-results.png": "context-repair-strategies-zh.png",
    "model-repair-matrix.png": "context-repair-model-matrix-zh.png",
    "ablation-slope.png": "context-repair-ablation-zh.png",
}


def pingfang() -> list[str]:
    """PingFang SC's regular and semibold faces, pulled out of the system collection,
    since matplotlib only loads the first face of a .ttc."""
    try:
        from fontTools.ttLib import TTCollection
    except ImportError:
        return []
    ttc = next(iter(Path("/System/Library").glob("AssetsV2/com_apple_MobileAsset_Font*/*/AssetData/PingFang.ttc")), None)
    if ttc is None:
        return []
    tmp = Path(tempfile.mkdtemp(prefix="context-repair-fonts-"))
    atexit.register(shutil.rmtree, tmp, True)
    for face in TTCollection(str(ttc)).fonts:
        name = face["name"].getDebugName(4)
        if name in ("PingFang SC Regular", "PingFang SC Semibold"):
            path = tmp / f"{name.replace(' ', '')}.otf"
            face.save(str(path))
            fm.fontManager.addfont(str(path))
    return ["PingFang SC"]


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
        "font.family": ["DejaVu Sans"] + (pingfang() + ["Arial Unicode MS"] if LANG == "zh" else []),
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
    path = ROOT / "website/assets" / ZH_NAMES[name] if LANG == "zh" else OUT / name
    fig.savefig(path, dpi=150, bbox_inches="tight", pad_inches=0.22)
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

    fig.suptitle(t["flag_title"], x=0.06, y=0.975,
                 ha="left", fontsize=21, fontweight="bold", color=INK)
    ax.text(0.05, 5.03, t["flag_sub"],
            fontsize=11.5, color=MUTED)

    state, ask = t["state"], t["ask"]
    chains = [
        [("24", GREEN_BG, GREEN), ("96", GREEN_BG, GREEN),
         ("107", GREEN_BG, GREEN), (state, GREEN_BG, GREEN), (ask, GRAY_BG, MUTED)],
        [("24", GREEN_BG, GREEN), (t["false30"], RED_BG, RED),
         ("120", ORANGE_BG, ORANGE), ("131", ORANGE_BG, ORANGE),
         (state, ORANGE_BG, ORANGE), (ask, GRAY_BG, MUTED)],
        [("24", GREEN_BG, GREEN), ("120", ORANGE_BG, ORANGE),
         ("131", ORANGE_BG, ORANGE), (state, ORANGE_BG, ORANGE), (ask, GRAY_BG, MUTED)],
        [("24", GREEN_BG, GREEN), (ask, GRAY_BG, MUTED)],
        [("24", GREEN_BG, GREEN), ("96′", GREEN_BG, GREEN),
         ("107′", GREEN_BG, GREEN), (state + "′", GREEN_BG, GREEN), (ask, GRAY_BG, MUTED)],
    ]
    rows = [(title, subtitle, nodes) for (title, subtitle), nodes in zip(t["rows"], chains)]
    cond_keys = ["clean", "polluted", "source_prune", "subgraph_prune", "recompute_descendants"]
    ys = [4.25, 3.3, 2.35, 1.4, 0.45]

    ax.text(0.05, 4.78, t["graph_state"], fontsize=9.5, fontweight="bold", color=MUTED)
    ax.text(11.0, 4.78, t["model_output"], fontsize=9.5, fontweight="bold", color=MUTED)

    for (title, subtitle, nodes), key, y in zip(rows, cond_keys, ys):
        ax.text(0.05, y + 0.09, title, fontsize=12.5, fontweight="bold", va="center")
        ax.text(0.05, y - 0.19, subtitle, fontsize=9.2, color=MUTED, va="top", linespacing=1.15)
        draw_chain(ax, y, nodes)

        output_values = {model: model_answers[key] for model, model_answers in answers.items()}
        unique = set(output_values.values())
        if len(unique) == 1:
            value = next(iter(unique))
            color = GREEN if value == "107" else RED
            ax.text(11.0, y + 0.02, t["all_nine"].format(value=value), fontsize=13.2,
                    fontweight="bold", color=color, va="center")
        else:
            good = [SHORT[m] for m, v in output_values.items() if v == "107"]
            bad = [SHORT[m] for m, v in output_values.items() if v != "107"]
            ax.text(11.0, y + 0.13, t["some_of_nine"].format(n=len(good)), fontsize=10.5,
                    fontweight="bold", color=GREEN, va="center")
            ax.text(11.0, y - 0.17, f"{', '.join(bad)}  →  131", fontsize=9.0,
                    fontweight="bold", color=RED, va="center")

        if y > 0.5:
            ax.plot([0.05, 14.0], [y - 0.48, y - 0.48], color=GRID, linewidth=0.8)

    legend = [
        Patch(facecolor=GREEN_BG, edgecolor=GREEN, label=t["legend"][0]),
        Patch(facecolor=RED_BG, edgecolor=RED, label=t["legend"][1]),
        Patch(facecolor=ORANGE_BG, edgecolor=ORANGE, label=t["legend"][2]),
    ]
    ax.legend(handles=legend, loc="lower left", bbox_to_anchor=(0.0, -0.095), ncol=3,
              frameon=False, fontsize=9.5, handlelength=1.4)
    ax.text(14.0, -0.25, t["flag_note"], ha="right", fontsize=9, color=MUTED)
    save(fig, "flagship-context-repair.png")


def figure_repair_rates(counts: dict[str, dict[str, tuple[int, int]]]) -> None:
    order = ["source_prune", "recompute_descendants", "subgraph_prune"]
    labels = t["rate_labels"]
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
    ax.set_xlabel(t["rate_x"], labelpad=10)
    ax.set_title(t["rate_title"], loc="left", fontsize=17, pad=21)
    total_eligible = sum(model["source_prune"][1] for model in counts.values())
    ax.text(0, 1.025, t["rate_sub"].format(n=total_eligible), transform=ax.transAxes,
            color=MUTED, fontsize=10.5)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    for yi, rate, (n, d) in zip(y, rates, totals):
        ax.text(rate + 1.0, yi, f"{n}/{d}  ·  {rate:.1f}%", va="center", ha="left",
                fontsize=11.5, fontweight="bold", color=INK)
    fig.text(0.91, 0.025, t["rate_note"],
             ha="right", fontsize=9.2, color=MUTED)
    fig.subplots_adjust(left=0.27, right=0.91, top=0.78, bottom=0.27)
    save(fig, "repair-strategy-results.png")


def figure_model_matrix(counts: dict[str, dict[str, tuple[int, int]]]) -> None:
    models = [name for name, _, _ in RUNS]
    strategies = ["source_prune", "subgraph_prune", "recompute_descendants"]
    labels = t["strategies"]
    matrix = [[counts[model][strategy][0] for strategy in strategies] for model in models]

    cmap = LinearSegmentedColormap.from_list("repair", ["#FDE2E2", "#FFF3D6", "#DDF7E7", "#8DDFAC"])
    fig, ax = plt.subplots(figsize=(9.7, 9.0))
    image = ax.imshow(matrix, cmap=cmap, vmin=14, vmax=18, aspect="auto")
    del image
    ax.set_xticks(range(len(labels)), labels, fontsize=11)
    ax.set_yticks(range(len(models)), models, fontsize=11)
    ax.tick_params(length=0)
    ax.set_title(t["matrix_title"], loc="left", fontsize=17, pad=28)
    ax.text(0, 1.04, t["matrix_sub"],
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
    ax.text(1.0, -0.17, t["matrix_note"],
            transform=ax.transAxes, ha="right", fontsize=9.2, color=MUTED)
    fig.subplots_adjust(left=0.25, right=0.97, top=0.76, bottom=0.22)
    save(fig, "model-repair-matrix.png")


ABLATION_RUNS = [
    ("Reasoning ON", ROOT / "benchmark/runs/ablation-nano30b-think-on/results.json"),
    ("Reasoning OFF", ROOT / "benchmark/runs/ablation-nano30b-think-off/results.json"),
]


def figure_model_dotplot(counts: dict[str, dict[str, tuple[int, int]]]) -> None:
    """Per-endpoint dot plot: three repair strategies on one row per model.
    The separating dimension (source-only) stands out immediately."""
    strategies = ["source_prune", "subgraph_prune", "recompute_descendants"]
    strat_labels = ["Source only", "Whole subgraph", "Recompute"]
    strat_colors = [ORANGE, GREEN, BLUE]
    models = sorted(counts.keys(), key=lambda m: counts[m]["source_prune"][0])

    fig, ax = plt.subplots(figsize=(10.6, 6.6))
    for i, model in enumerate(models):
        ax.axhline(i, color=GRID, linewidth=0.8, zorder=1)
        for strategy, color in zip(strategies, strat_colors):
            n, d = counts[model][strategy]
            jitter = {"source_prune": -0.13, "subgraph_prune": 0.13, "recompute_descendants": 0.0}[strategy]
            ax.scatter(n, i + jitter, s=130, color=color, zorder=3, edgecolors="white", linewidths=1.2)
    ax.set_yticks(range(len(models)), models, fontsize=11)
    ax.set_xlim(0, 18.9)
    ax.set_xticks([0, 3, 6, 9, 12, 15, 18])
    ax.set_xlabel("Repaired cases out of 18 first derailed", labelpad=10)
    ax.set_title("Every endpoint, every strategy: only source-only pruning separates them", loc="left", fontsize=15.5, pad=30)
    ax.text(0, 1.05, "Nine endpoints. Dots at 18 mean every derailed case recovered.", transform=ax.transAxes, color=MUTED, fontsize=10.5)
    handles = [plt.Line2D([], [], marker="o", linestyle="", markersize=10, color=c, label=l) for l, c in zip(strat_labels, strat_colors)]
    ax.legend(handles=handles, loc="lower left", frameon=False, fontsize=10)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)
    fig.text(0.91, 0.02, "Pilot / reference results. Exact-match scoring; no LLM judge.", ha="right", fontsize=9, color=MUTED)
    fig.subplots_adjust(left=0.26, right=0.94, top=0.80, bottom=0.16)
    save(fig, "model-strategy-dotplot.png")


def figure_ablation_slope() -> None:
    """Slope chart: the reasoning toggle on one text-only model.
    Source-only repair collapses; recompute holds."""
    results = {name: json.loads(path.read_text()) for name, path in ABLATION_RUNS}
    counts = repair_counts(results)
    strategies = ["recompute_descendants", "subgraph_prune", "source_prune"]
    labels = [t["strategies"][2], t["strategies"][1], t["strategies"][0]]
    colors = [BLUE, GREEN, ORANGE]

    fig, ax = plt.subplots(figsize=(8.6, 6.2))
    # stagger left labels that share the same y (both perfect scores sit at 18)
    left_offsets = {"recompute_descendants": 10, "subgraph_prune": -10, "source_prune": 0}
    for strategy, label, color in zip(strategies, labels, colors):
        on = counts["Reasoning ON"][strategy][0]
        off = counts["Reasoning OFF"][strategy][0]
        ax.plot([0, 1], [on, off], color=color, linewidth=2.6, marker="o", markersize=9, zorder=3)
        ax.annotate(f"{label}  {on}/18", (0, on), textcoords="offset points",
                    xytext=(-12, left_offsets[strategy]), ha="right", va="center",
                    fontsize=11, fontweight="bold", color=color)
        ax.annotate(f"{off}/18", (1, off), textcoords="offset points", xytext=(12, 0), ha="left", va="center", fontsize=11, fontweight="bold", color=color)
    ax.set_xlim(-0.7 if LANG == "zh" else -0.55, 1.35)  # the Chinese labels need the wider margin
    ax.set_ylim(-0.8, 19.2)
    ax.set_xticks([0, 1], t["abl_ticks"], fontsize=12)
    ax.set_yticks([0, 6, 12, 18])
    ax.set_ylabel(t["abl_y"], labelpad=8)
    ax.set_title(t["abl_title"], loc="left", fontsize=15.5, pad=30)
    ax.text(0, 1.04, t["abl_sub"], transform=ax.transAxes, color=MUTED, fontsize=9.6)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    fig.text(0.93, 0.02, t["abl_note"], ha="right", fontsize=9.2, color=MUTED)
    fig.subplots_adjust(left=0.26, right=0.85, top=0.78, bottom=0.12)
    save(fig, "ablation-slope.png")


def main() -> None:
    base_style()
    results = load_results()
    counts = repair_counts(results)
    figure_flagship(flagship_answers(results))
    figure_repair_rates(counts)
    figure_model_matrix(counts)
    if LANG == "en":  # the dot plot is not on the website
        figure_model_dotplot(counts)
    figure_ablation_slope()


if __name__ == "__main__":
    main()
