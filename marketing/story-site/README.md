# ThoughtDAG bilingual product story

This is a standalone, crawlable marketing page built around a scroll-driven
product story. English is the default language; add `?lang=zh` or use the
navigation toggle for Chinese. It intentionally keeps ThoughtDAG's own product
boundary and visual semantics:

- purple solid edges are full context;
- orange branches are explicit side paths;
- deleting an edge changes the request, not just the diagram;
- the story ends on inspectable context rather than autonomous agents.

It is published with the main app at:

```text
https://app.thoughtdag.workers.dev/story/
https://app.thoughtdag.workers.dev/story/?lang=zh
```

`npm run build` copies the page and its final films into `dist/story/`, so the
existing Cloudflare deployment publishes the app and product story together.

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
