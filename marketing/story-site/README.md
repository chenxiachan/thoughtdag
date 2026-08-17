# ThoughtDAG bilingual product story

This is a standalone, crawlable marketing page built around a scroll-driven
product story. English is the default language; add `?lang=zh` or use the
navigation toggle for Chinese. It intentionally keeps ThoughtDAG's own product
boundary and visual semantics:

- purple solid edges are full context;
- orange branches are explicit side paths;
- deleting an edge changes the request, not just the diagram;
- the story ends on inspectable context rather than autonomous agents.

It is published with GitHub Pages at:

```text
https://chenxiachan.github.io/thoughtdag/
https://chenxiachan.github.io/thoughtdag/?lang=zh
https://chenxiachan.github.io/thoughtdag/stories/context-repair/
https://chenxiachan.github.io/thoughtdag/research/context-repair-pilot-v1/
```

The `product-story-pages.yml` workflow publishes this directory as a static
artifact whenever it changes on `main`. The live app remains on Cloudflare;
its former `/story/` route permanently redirects here.

Preview from the repository root:

```bash
python3 -m http.server 4175
```

Then open:

```text
http://127.0.0.1:4175/marketing/story-site/
```

The page selects the final product film by both language and viewport:

```text
marketing/story-site/assets/thoughtdag-story-en-horizontal.mp4
marketing/story-site/assets/thoughtdag-story-zh-horizontal.mp4
marketing/story-site/assets/thoughtdag-story-en-vertical.mp4
marketing/story-site/assets/thoughtdag-story-zh-vertical.mp4
```

Viewports up to 760px use the 9:16 vertical films. Wider viewports use the
16:9 horizontal films. Switching the page language also switches the film,
poster frame, accessible label, and duration.

Canonical, alternate-language, Open Graph, robots, and sitemap metadata point
to the shared public deployment.

The homepage introduces the Context Repair Pilot without turning the product
story into a report. The concise bilingual case study lives under `stories/`,
while the English technical report and reproducibility links live under
`research/`.
