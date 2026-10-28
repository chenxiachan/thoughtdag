#!/usr/bin/env python3
"""Figures for the turn-cost note, from benchmark/runs/turn-cost/<date>.json.

Writes the report figures to website/assets (English, and Chinese with a -zh
suffix) and a 4:5 social card of each (1080 x 1350, own title and source line)
to docs/social/turn-cost and docs/social/turn-cost/zh.
"""

from __future__ import annotations

import atexit
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

ROOT = Path(__file__).resolve().parents[2]
RUN = Path(sys.argv[1]) if len(sys.argv) > 1 else sorted((ROOT / "benchmark/runs/turn-cost").glob("*.json"))[-1]
OUT = ROOT / "website/assets"
SOCIAL = ROOT / "docs/social/turn-cost"
data = json.loads(RUN.read_text())["runners"]

INK = "#211f29"
MUTED = "#6d6878"
LINE = "#ded9e8"
PAPER = "#ffffff"
PURPLE = "#a79ff4"
DEEP_PURPLE = "#6b5ce7"
ANSWER = "#3b3646"
ORANGE = "#e8890c"
BOTH = "#b45309"
THINK = "#6d6878"
FADED = "#c9c4d4"
NAMES = {"claude-code": "Claude Code", "codex": "Codex", "dsh": "DeepSeek Harness"}
ORDER = ["claude-code", "codex", "dsh"]
PART_STYLE = [("q", PURPLE, None), ("a", ANSWER, None), ("toolFull", ORANGE, None), ("think", "white", "////")]
SERIES_STYLE = [(None, ANSWER, None), ("withTools", ORANGE, None), ("withThinking", "white", "////"), ("withBoth", BOTH, None)]
TOTAL_TURNS = sum(r["turns"] for r in data.values())

T = {
    "en": {
        "parts": ["question", "answer", "tool calls and results", "thinking"],
        "series": ["answer only", "+ tool record", "+ thinking", "+ both"],
        "turns": "{n:,} turns",
        "answer": "answer {p}",
        "codex_use": "mostly computer-use tasks",
        "next_turn": "next turn · n={n:,}",
        "control": "control: next tool call · n={n:,}",
        "median": "median\n{m:.2f}",
        "dropped": "dropped",
        "kept": "kept",
        "carry_x": "share of the earlier thinking still in the next prompt\n(box: middle half of boundaries; whiskers: 10th to 90th percentile)",
        "fwd_y": "tokens a question below reads\n(answer only = 1×)",
        "brand_note": "research note: Where an agent turn's tokens go",
        "source": f"{TOTAL_TURNS:,} agent turns from the author's own logs, Sep 27 to Oct 27, 2026.",
        "c1": ("Where an agent turn's tokens go",
               "The answer you read is only\n1 to 7% of an agent turn",
               "The rest is tool calls with their results,\nand the model's thinking.",
               "Shares vary widely with use; the answer stayed small in all three.\n"
               "Thinking from the providers' token counts; tool results at full size."),
        "c2": ("Does the agent keep its thinking?",
               "Each new turn still carries\nthe previous turn's thinking",
               "Share of the earlier thinking still in the prompt\nthat opens the next turn, at each turn boundary.",
               "From the providers' own prompt and output counts; consistent with their\n"
               "documentation for these models. Codex: not readable by this method."),
        "c3": ("What should pass to the next question?",
               "Passing on the tool record\nmeans reading 6.5 to 28× more",
               "Tokens a question asked below an agent turn reads,\nrelative to passing on the answer alone.",
               "Tool record as the canvas stores it, each result clipped to 4,000 characters.\n"
               "The multiples vary widely with how an agent is used."),
        "boundaries": "{n:,} turn boundaries",
        "kept_all": "all {n} kept it",
        "kept_share": "{p:.0f}% kept it",
        "x_dropped": "0  dropped",
        "x_kept": "1  kept",
    },
    "zh": {
        "parts": ["问题", "回答", "工具调用和结果", "思考"],
        "series": ["只传回答", "+ 工具记录", "+ 思考", "+ 两者"],
        "turns": "{n:,} 轮",
        "answer": "回答 {p}",
        "codex_use": "多为操作电脑的事务性工作",
        "next_turn": "下一轮 · n={n:,}",
        "control": "对照：下一次工具调用 · n={n:,}",
        "median": "中位数\n{m:.2f}",
        "dropped": "丢弃",
        "kept": "保留",
        "carry_x": "上一轮的思考在下一次提示里仍保留的比例\n（箱体：中间一半的交界；须线：第 10 到第 90 百分位）",
        "fwd_y": "下方问题要读的 token\n（只传回答 = 1×）",
        "brand_note": "研究笔记：Agent 一轮的 token 去了哪里",
        "source": f"作者本人的本机日志，2026 年 9 月 27 日至 10 月 27 日，共 {TOTAL_TURNS:,} 轮。",
        "c1": ("Agent 一轮的 token 去了哪里",
               "你读到的回答，只占\n一轮 token 的 1% 到 7%",
               "其余是工具调用及其结果，\n以及模型的思考。",
               "各部分占比随使用方式差别很大；三个运行时里，回答都只占少数。\n"
               "思考按服务商的 token 计数；工具结果按原始大小计。"),
        "c2": ("Agent 会保留思考吗？",
               "下一轮仍然带着\n上一轮的思考",
               "每个轮次交界处，开启下一轮的提示里\n仍保留的上一轮思考的比例。",
               "依据服务商自己记录的提示与输出 token 数，与各家对这些模型的\n"
               "文档一致。Codex 用这个方法读不出结论。"),
        "c3": ("下一个问题该带上什么？",
               "把工具记录也传下去，\n要读的内容多 6.5 到 28 倍",
               "在一轮 Agent 对话下面提问时要读的 token，\n以只传回答为 1 倍。",
               "工具记录按画布保存的样子计，每条结果截到 4,000 字符。\n"
               "倍数随使用方式差别很大。"),
        "boundaries": "{n:,} 个轮次交界",
        "kept_all": "{n} 个全部保留",
        "kept_share": "{p:.0f}% 完整保留",
        "x_dropped": "0  丢弃",
        "x_kept": "1  保留",
    },
}
SUFFIX = {"en": "", "zh": "-zh"}
CARD_DIR = {"en": SOCIAL, "zh": SOCIAL / "zh"}


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
    tmp = Path(tempfile.mkdtemp(prefix="turn-cost-fonts-"))
    atexit.register(shutil.rmtree, tmp, True)
    for face in TTCollection(str(ttc)).fonts:
        name = face["name"].getDebugName(4)
        if name in ("PingFang SC Regular", "PingFang SC Semibold"):
            path = tmp / f"{name.replace(' ', '')}.otf"
            face.save(str(path))
            fm.fontManager.addfont(str(path))
    return ["PingFang SC"]


ZH_FONTS = pingfang() + ["Arial Unicode MS"]


def use_language(lang: str) -> dict:
    # Arial ships a bold face matplotlib can load; Helvetica Neue's .ttc yields only the regular one.
    # Chinese glyphs fall back to PingFang, so Latin text and numbers look the same in both languages.
    plt.rcParams.update({
        "font.family": ["Arial"] + (ZH_FONTS if lang == "zh" else []) + ["DejaVu Sans"],
        "font.size": 13,
        "axes.edgecolor": LINE,
        "axes.labelcolor": INK,
        "xtick.color": MUTED,
        "ytick.color": INK,
        "xtick.labelsize": 13,
        "ytick.labelsize": 13,
        "hatch.linewidth": 1.0,
        "figure.facecolor": PAPER,
        "axes.facecolor": PAPER,
    })
    return T[lang]


def pct(share: float) -> str:
    return f"{share * 100:.0f}%" if share >= 0.1 else f"{share * 100:.1f}%"


def clean(ax, keep=("bottom",)) -> None:
    for s in ("top", "right", "left", "bottom"):
        ax.spines[s].set_visible(s in keep)


def parts(t: dict):
    return [(label, key, color, hatch) for label, (key, color, hatch) in zip(t["parts"], PART_STYLE)]


def series(t: dict):
    return [(label, key, color, hatch) for label, (key, color, hatch) in zip(t["series"], SERIES_STYLE)]


def shares(r: str, t: dict) -> list[tuple[str, str, str, str | None, float]]:
    p = data[r]["pooled"]
    total = sum(p[k] for _, k, _, _ in parts(t))
    return [(label, key, color, hatch, p[key] / total) for label, key, color, hatch in parts(t)]


def legend_handles(items) -> list[Patch]:
    return [Patch(facecolor=c, hatch=h, edgecolor=THINK if h else c, label=l) for l, _, c, h in items]


def draw_composition(ax, t: dict, size: float, bar_h: float, answer_below: bool) -> None:
    """Stacked share bars, one row per runtime. The answer's slice is too thin to hold its number,
    so it is labelled outside: below its bar on a card, above it in the report."""
    for row, r in enumerate(ORDER):
        left = 0.0
        for label, key, color, hatch, share in shares(r, t):
            ax.barh(row, share, left=left, color=color, hatch=hatch, edgecolor=THINK if hatch else PAPER,
                    linewidth=0.9 if hatch else 2, height=bar_h)
            mid = left + share / 2
            if key == "a" and answer_below:
                ax.annotate(t["answer"].format(p=pct(share)), xy=(mid, row + bar_h / 2), xytext=(left, row + bar_h / 2 + 0.08),
                            fontsize=size, fontweight="bold", color=INK, va="top", ha="left",
                            arrowprops=dict(arrowstyle="-", color=INK, lw=1.4, shrinkA=0, shrinkB=0))
            elif key == "a":
                ax.annotate(t["answer"].format(p=pct(share)), xy=(mid, row - bar_h / 2), xytext=(mid + 0.025, row - bar_h / 2 - 0.2),
                            fontsize=size, fontweight="bold", color=INK, va="bottom",
                            arrowprops=dict(arrowstyle="-", color=INK, lw=1.1, shrinkA=0, shrinkB=0))
            elif share >= 0.045:
                ax.text(mid, row, pct(share), ha="center", va="center", fontsize=size, fontweight="bold",
                        color=INK if hatch else "white",
                        bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.9) if hatch else None)
            left += share
    ax.set_xlim(0, 1)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1], ["0", "25%", "50%", "75%", "100%"])
    ax.tick_params(axis="y", length=0)
    clean(ax)


# Report figures: drawn 10 in wide so that, at the report's ~770 px column, 13 pt text shows at about 14 px.
S = 1.25


def composition(lang: str) -> None:
    t = use_language(lang)
    fig, ax = plt.subplots(figsize=(8 * S, 3.9 * S), dpi=180)
    draw_composition(ax, t, size=14, bar_h=0.56, answer_below=False)
    ax.set_yticks(range(len(ORDER)), [f"{NAMES[r]}\n{t['turns'].format(n=data[r]['turns'])}" for r in ORDER])
    ax.set_ylim(len(ORDER) - 0.55, -0.85)
    ax.legend(handles=legend_handles(parts(t)), loc="lower center", bbox_to_anchor=(0.42, 1.0), ncol=4, frameon=False,
              fontsize=13, handlelength=1.6, columnspacing=1.2)
    fig.tight_layout()
    fig.savefig(OUT / f"turn-cost-composition{SUFFIX[lang]}.png", bbox_inches="tight")
    plt.close(fig)


def carry(lang: str) -> None:
    t = use_language(lang)
    rows = []
    for r in ["claude-code", "dsh", "codex"]:
        a, w = data[r]["carryAcross"], data[r]["carryWithin"]
        rows.append((f"{NAMES[r]}\n{t['next_turn'].format(n=a['n'])}", a["shares"], r, False))
        rows.append((f"{NAMES[r]}\n{t['control'].format(n=w['n'])}", w["shares"], r, True))
    fig, ax = plt.subplots(figsize=(8 * S, 6.2 * S), dpi=180)
    ax.axvline(0, color=MUTED, lw=1, ls="--", zorder=0)
    ax.axvline(1, color=MUTED, lw=1, ls="--", zorder=0)
    for i, (label, vals, r, control) in enumerate(rows):
        faded = r == "codex"
        color = FADED if faded else (ORANGE if control else DEEP_PURPLE)
        ax.boxplot([vals], positions=[i], vert=False, widths=0.55, whis=(10, 90), showfliers=False, patch_artist=True,
                   medianprops=dict(color=INK, linewidth=2.2), boxprops=dict(facecolor=color, edgecolor=color, alpha=0.55),
                   whiskerprops=dict(color=color, linewidth=1.4), capprops=dict(color=color, linewidth=1.4))
        med = sorted(vals)[len(vals) // 2]
        ax.text(3.1, i, t["median"].format(m=med), va="center", fontsize=12.5, linespacing=1.15,
                color=MUTED if faded else INK, fontweight="normal" if faded else "bold")
    for x, word in ((0, t["dropped"]), (1, t["kept"])):
        ax.text(x, -0.95, word, ha="center", va="center", fontsize=13, color=INK, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.25", fc="white", ec="none"))
    ax.set_yticks(range(len(rows)), [r[0] for r in rows], fontsize=12.5, linespacing=1.25)
    ax.set_xlim(-1.6, 3.0)
    ax.set_ylim(len(rows) - 0.45, -1.3)
    ax.set_xlabel(t["carry_x"], color=MUTED, fontsize=12.5, labelpad=10)
    ax.tick_params(axis="y", length=0)
    clean(ax)
    fig.tight_layout()
    fig.savefig(OUT / f"turn-cost-carry{SUFFIX[lang]}.png", bbox_inches="tight")
    plt.close(fig)


def forwarding(lang: str) -> None:
    t = use_language(lang)
    fig, ax = plt.subplots(figsize=(8 * S, 4.6 * S), dpi=180)
    width = 0.22
    for i, r in enumerate(ORDER):
        f = data[r]["forwarding"]
        for j, (label, key, color, hatch) in enumerate(series(t)):
            v = 1.0 if key is None else f[key]["pooled"]
            x = i + (j - 1.5) * width
            ax.bar(x, v, width * 0.9, color=color, hatch=hatch, edgecolor=THINK if hatch else color, linewidth=0.9)
            ax.text(x, v + 0.5, f"{v:.1f}×", ha="center", va="bottom", fontsize=12,
                    fontweight="bold", color=INK)
    ax.set_xticks(range(len(ORDER)), [NAMES[r] for r in ORDER], fontsize=13.5, color=INK)
    ax.set_ylim(0, 36)
    ax.set_ylabel(t["fwd_y"], color=MUTED, fontsize=12.5)
    ax.tick_params(axis="x", length=0)
    clean(ax, keep=("bottom", "left"))
    ax.legend(handles=legend_handles(series(t)), loc="upper left", frameon=False, fontsize=13, handlelength=1.6)
    fig.tight_layout()
    fig.savefig(OUT / f"turn-cost-forwarding{SUFFIX[lang]}.png", bbox_inches="tight")
    plt.close(fig)


# Social cards: 1080 x 1350, laid out in figure fractions. 20 pt here is about 15 px on a phone feed.

W, H, CARD_DPI = 7.2, 9.0, 150
X0 = 0.075
NOTE_LINE = 13 * 1.35 / 72 / H  # one 13 pt footnote line, as a fraction of the card's height


def logo_image():
    if not shutil.which("rsvg-convert"):
        return None
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "logo.png"
        subprocess.run(["rsvg-convert", "-w", "96", "-h", "96", str(OUT / "favicon.svg"), "-o", str(png)], check=True)
        return plt.imread(png)


LOGO = logo_image()


def card(t: dict, n: int, kicker: str, title: str, subtitle: str, note: str):
    """A card's frame. The footnote grows upward from the brand row, one line at a time."""
    fig = plt.figure(figsize=(W, H), dpi=CARD_DPI)
    fig.text(X0, 0.945, kicker.upper() if kicker.isascii() else kicker, fontsize=15, fontweight="bold", color=DEEP_PURPLE, va="top")
    fig.text(1 - X0, 0.945, f"{n} / 3", fontsize=15, color=MUTED, va="top", ha="right")
    fig.text(X0, 0.905, title, fontsize=31, fontweight="bold", color=INK, va="top", linespacing=1.12)
    fig.text(X0, 0.78, subtitle, fontsize=18, color=MUTED, va="top", linespacing=1.3)
    top = 0.062 + NOTE_LINE * (note.count("\n") + 1)
    fig.add_artist(plt.Line2D([X0, 1 - X0], [top + 0.017, top + 0.017], color=LINE, lw=1.2))
    fig.text(X0, top, note, fontsize=13, color=MUTED, va="top", linespacing=1.35)
    if LOGO is not None:
        lx = fig.add_axes([X0, 0.022, 0.042, 0.042 * W / H])
        lx.imshow(LOGO)
        lx.axis("off")
    brand = fig.text(X0 + 0.055, 0.037, "ThoughtDAG", fontsize=15, fontweight="bold", color=INK, va="center")
    right = brand.get_window_extent(fig.canvas.get_renderer()).x1 / fig.bbox.width
    fig.text(right + 0.015, 0.037, t["brand_note"], fontsize=13.5, color=MUTED, va="center")
    return fig


def card_composition(lang: str) -> None:
    t = use_language(lang)
    kicker, title, subtitle, note = t["c1"]
    fig = card(t, 1, kicker, title, subtitle, f"{t['source']}\n{note}")
    fig.legend(handles=legend_handles(parts(t)), loc="upper left", bbox_to_anchor=(X0 - 0.012, 0.69), ncol=2, frameon=False,
               fontsize=18, handlelength=1.5, handleheight=1.0, columnspacing=1.5, labelspacing=0.45, borderaxespad=0)
    ax = fig.add_axes([X0, 0.18, 1 - 2 * X0, 0.42])
    draw_composition(ax, t, size=18, bar_h=0.36, answer_below=True)
    ax.set_yticks([])
    ax.set_xticks([])
    clean(ax, keep=())
    ax.set_ylim(len(ORDER) - 0.45, -0.55)
    for row, r in enumerate(ORDER):
        side = t["turns"].format(n=data[r]["turns"])
        if r == "codex":
            side += f" · {t['codex_use']}"
        ax.text(0, row - 0.23, NAMES[r], fontsize=20, fontweight="bold", color=INK, va="bottom")
        ax.text(1, row - 0.23, side, fontsize=17, color=MUTED, va="bottom", ha="right")
    fig.savefig(CARD_DIR[lang] / "1-answer-share.png", dpi=CARD_DPI)
    plt.close(fig)


def card_carry(lang: str) -> None:
    t = use_language(lang)
    fig = card(t, 2, *t["c2"])
    # Bins 0.2 wide from -0.5, so the bin at 1.0 is the report's 0.9 to 1.1; the end bins take what lies beyond.
    centers = [round(-0.4 + 0.2 * i, 1) for i in range(10)]
    for k, r in enumerate(["claude-code", "dsh"]):
        vals = data[r]["carryAcross"]["shares"]
        counts = [0] * len(centers)
        for v in vals:
            counts[max(0, min(len(centers) - 1, int((v + 0.5) // 0.2)))] += 1
        frac = [c / len(vals) for c in counts]
        bottom = 0.465 - k * 0.255
        ax = fig.add_axes([X0, bottom, 1 - 2 * X0, 0.125])
        ax.bar(centers, frac, width=0.17, color=[DEEP_PURPLE if c == 1.0 else FADED for c in centers])
        top = frac[centers.index(1.0)]
        label = t["kept_all"].format(n=len(vals)) if counts[centers.index(1.0)] == len(vals) else t["kept_share"].format(p=top * 100)
        ax.text(0.88, top * 0.55, label, fontsize=20, fontweight="bold", color=DEEP_PURPLE, va="center", ha="right")
        ax.set_ylim(0, 1.0)
        ax.set_xlim(-0.52, 1.52)
        ax.set_yticks([])
        ax.set_xticks([0, 1], [t["x_dropped"], t["x_kept"]], fontsize=17, color=INK)
        ax.tick_params(axis="x", length=0, pad=6)
        ax.axvline(0, color=MUTED, lw=1, ls="--", zorder=0)
        ax.axvline(1, color=MUTED, lw=1, ls="--", zorder=0)
        clean(ax)
        fig.text(X0, bottom + 0.14, NAMES[r], fontsize=21, fontweight="bold", color=INK, va="bottom")
        fig.text(1 - X0, bottom + 0.14, t["boundaries"].format(n=len(vals)), fontsize=17, color=MUTED, va="bottom", ha="right")
    fig.savefig(CARD_DIR[lang] / "2-thinking-kept.png", dpi=CARD_DPI)
    plt.close(fig)


def card_forwarding(lang: str) -> None:
    t = use_language(lang)
    kicker, title, subtitle, note = t["c3"]
    first, rest = note.split("\n", 1)
    fig = card(t, 3, kicker, title, subtitle, f"{first}\n{t['source']}\n{rest}")
    for k, r in enumerate(ORDER):
        f = data[r]["forwarding"]
        bottom = 0.535 - k * 0.172
        ax = fig.add_axes([0.32, bottom, 0.6, 0.118])
        vals = [1.0 if key is None else f[key]["pooled"] for _, key, _, _ in series(t)]
        for j, ((label, key, color, hatch), v) in enumerate(zip(series(t), vals)):
            ax.barh(j, v, height=0.74, color=color, hatch=hatch, edgecolor=THINK if hatch else color, linewidth=0.9)
            ax.text(v + 0.5, j, f"{v:.1f}×", va="center", fontsize=17, fontweight="bold", color=INK)
        ax.set_yticks(range(len(series(t))), [s[0] for s in series(t)], fontsize=16, color=INK)
        ax.set_ylim(len(series(t)) - 0.55, -0.55)
        ax.set_xlim(0, 36)
        ax.set_xticks([])
        ax.tick_params(axis="y", length=0, pad=8)
        clean(ax, keep=("left",))
        name = fig.text(X0, bottom + 0.124, NAMES[r], fontsize=21, fontweight="bold", color=INK, va="bottom")
        if r == "codex":
            right = name.get_window_extent(fig.canvas.get_renderer()).x1 / fig.bbox.width
            fig.text(right + 0.02, bottom + 0.127, t["codex_use"], fontsize=16, color=MUTED, va="bottom")
    fig.savefig(CARD_DIR[lang] / "3-handoff-cost.png", dpi=CARD_DPI)
    plt.close(fig)


for lang in ("en", "zh"):
    CARD_DIR[lang].mkdir(parents=True, exist_ok=True)
    composition(lang)
    carry(lang)
    forwarding(lang)
    card_composition(lang)
    card_carry(lang)
    card_forwarding(lang)
print("wrote", OUT / "turn-cost-{composition,carry,forwarding}[-zh].png", "and", SOCIAL / "[zh/]{1,2,3}-*.png")
