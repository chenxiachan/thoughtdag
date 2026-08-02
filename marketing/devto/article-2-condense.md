---
title: Context compaction happens in the dark. I made it happen on a map.
published: false
tags: ai, llm, showdev, opensource
# cover_image: (建议：凝练前后对比截图，或 og.jpg；发布前定)
---

<!--
发布备忘（不进正文）：
- 视频已上线：https://www.youtube.com/watch?v=YdJJflUxBi0（正文用 liquid tag 内嵌）
- [GIF: condense-run] 占位待录：凝练浮窗扫描 → 勾选段 → 构建 → 副本树落地，10-15s
- 第一篇文章链接替换处：{{ARTICLE_1_URL}}
- 口径检查过：无星数引用、无第三方品牌名（用通称）、无情绪钩子、机制导向
-->

Every long AI session ends the same way. The context window fills up, and something has to give.

Most tools handle this moment for you. A summarizer wakes up, rewrites your history into a paragraph you never see, and the conversation carries on as if nothing happened. Coding agents call it auto-compact. Agent frameworks call it a condenser. The names differ; the shape is the same: **the most consequential edit of your session is made by a machine, in the dark, and you were not in the room.**

What did it keep? What did it drop? Was the decision you spent twenty minutes reaching preserved, or was it flattened into "the user explored several options"? You cannot answer any of these questions, because there is nothing to look at.

I have been building [ThoughtDAG](https://github.com/chenxiachan/thoughtdag) around one rule that makes this unacceptable: **a wire is context**. Your conversation lives as a graph on an infinite canvas. Every answer is a node; the wires between nodes decide exactly what the model sees on the next question. Delete one edge, get a different answer. [I wrote about that rule here]({{ARTICLE_1_URL}}).

If you haven't seen the canvas before, here is the 30-second version:

{% youtube YdJJflUxBi0 %}

This post is about what that rule forces you to do when the map itself grows too heavy. Compaction has to happen somewhere. The question is whether it happens where you can see it.

## Condensing, where you can watch

In ThoughtDAG, condensing is not something that happens *to* your conversation. It is something you watch happen *beside* it.

Press condense, and the app scans the graph for what I call **runs**: straight corridors of Q&A where the conversation just marched forward. Three or more turns, one way in, one way out, nothing decisive in the middle. These are the acres of "okay, now try it this way" that every real working session accumulates. The scan is a pure graph walk. No model gets to vote on what counts as collapsible; the structure decides.

Each candidate run shows up in a list, checked by default, with the token saving printed next to it. Click a run and the canvas flies there, so you can look at what you are about to fold before you fold it. Uncheck anything you want to keep whole.

[GIF: condense-run — 扫描、勾选、构建、副本树在原树右侧落地]

Then the build starts, and this is the part I care most about: **your original tree is never touched.** Condensing builds a second tree beside the first one. Checked runs collapse into distill nodes; every other node is copied as it stands; every wire is rebuilt. The two trees sit on the same canvas, side by side. Nothing was edited. Something new was made.

## What never gets compressed

The distiller works under fidelity rules that are enforced by structure, not by prompt:

- **Decisions and pivots never collapse.** Any turn you marked as a ruling-out, a decision, or a change of direction is a landmark. Landmarks survive as full nodes in the condensed tree, always.
- **Your highlights survive verbatim.** Machine prose gets summarized. Text a human marked as important is carried through word for word. The principle in one line: what the machine said can be compressed; what the human marked must survive as written.
- **The working frontier is off limits.** The last three steps above every leaf are where you are thinking right now. The scanner never proposes them, no matter what a model might consider "old".
- **Every distill node knows where it came from.** A provenance chip on each distilled node jumps back to the exact run it replaced, in the original tree. The audit trail is one click, not an act of faith.

## The part where it becomes an experiment

Here is what a visible copy buys you that no black box can offer: **you can test the compression.**

Wire the same question into both trees. Ask it twice. One answer runs on the full history; the other runs on the distilled version. If they agree, your condensed tree just proved it carries what matters, and you can archive the original with actual evidence instead of hope. If they diverge, the diff is pointing at exactly what the summary lost, and the chip takes you to the run that needs a closer look.

Compaction stops being an act of trust in a summarizer. It becomes a comparison you can run.

## Why "editable, not autonomous" is the whole point

A reader of the first post left a comment I keep coming back to: keeping the edit rights in human hands is not a feature limitation, it is a trust mechanism. I would push it one step further. Because you hold the edit rights, you can run controlled comparisons. Because you can run comparisons, trust in the tool is earned by evidence, not assumed by default. Visible leads to editable, editable leads to testable. That chain is the product.

Context compaction was the hardest place to keep that chain intact, because every incentive says: just summarize quietly, nobody looks anyway. Building it as a side-by-side copy, with landmarks pinned and provenance wired in, was the version I could defend.

## Try it

The demo runs in the browser: **no install, no signup**. Load the example canvas, or drop in a PDF and start from reading. Condense lives in the toolbar once your graph has grown some corridors.

- Live demo: https://app.thoughtdag.workers.dev
- Source: https://github.com/chenxiachan/thoughtdag
- The one-rule intro, in 30 seconds: https://www.youtube.com/watch?v=YdJJflUxBi0

Delete one edge. Get a different answer. And when the map gets heavy, fold it where everyone can see the folds.
