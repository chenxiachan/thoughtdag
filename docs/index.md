# Install and quick start

ThoughtDAG turns LLM conversations into an editable graph. Each node contains a question and answer; incoming wires determine what the model sees next.

::: tip Desktop app recommended
The desktop app provides the complete experience: local session discovery, Session Atlas, automatic folder backup, bundled search and tools, and desktop updates.

**[Download ThoughtDAG](https://chenxiachan.github.io/thoughtdag/#download)** · [All releases](https://github.com/chenxiachan/thoughtdag/releases/latest)
:::

## Install the desktop app

### macOS

Install with Homebrew:

```bash
brew install --cask thoughtdag
```

The macOS build is signed and notarized. You can also download it from the [official download page](https://chenxiachan.github.io/thoughtdag/#download).

### Windows and Linux

Choose the correct installer on the [download page](https://chenxiachan.github.io/thoughtdag/#download). Windows builds are not signed yet, so SmartScreen may show a warning.

## See the interface in under a minute

The recording below shows the actual app: asking from a document, removing an unwanted context path, zooming from full answers to the map, and opening backup/export controls.

<img src="./hero-demo-en.gif" alt="ThoughtDAG desktop overview: document questions, editable context edges, semantic zoom, backups, and Session Atlas for persistent project context" width="100%" loading="lazy"/>

## First launch: choose where to start

The first screen offers four entry points. You can inspect examples and existing work before deciding whether to connect a model.

![ThoughtDAG first screen with question, material, Session Atlas, and model connection entries](/screenshots/onboarding/en/landing-en-annotated.png)

> The red labels and dashed leaders are documentation overlays, not part of the app. [Open the unannotated screenshot](/screenshots/onboarding/en/landing-en.png).

1. **Ask a question**: after connecting a model, start the graph from a real question.
2. **Add material**: drop in a PDF, image, or another file. Opening and reading need no model; asking and recognition do.
3. **Open local agent sessions**: enter [Session Atlas](/guides/session-atlas). Viewing a mirror graph needs no model.
4. **Connect a model**: enable answer generation, image recognition, and condensing.

If you only want to learn the interface, **Load example canvas** at the bottom of the page needs no setup.

## Connect your first model

When you need generation, choose **Connect a model**. One connection is enough to begin; you do not need to configure every option.

![ThoughtDAG model connection window with connection type, authorization, API key, and storage boundary](/screenshots/onboarding/en/connect-model-en-annotated.png)

> The red callouts are documentation overlays. [Open the unannotated screenshot](/screenshots/onboarding/en/connect-model-en.png).

- **Fastest path**: use the one-time authorization in the interface.
- **Existing API key**: choose its provider preset and paste the key.
- **Local model**: choose Ollama, or use a custom endpoint.

The flow is: **choose a connection → authorize or enter a key → fetch models → select models → save**. The window states where connection information is kept; see [Connect a model](/setup) for providers, subscriptions, local models, and developer configuration.

## Continue

1. Load the example canvas or ask your first real question.
2. Open the [interface overview](/guides/interface-overview) to learn the toolbar, nodes, wires, and floating panel.
3. To continue local agent work, see [source and handoff setup](/guides/session-atlas#configure-sources-and-handoff).

**[Browse all guides by interface area →](/guides/)**

## Other ways to run ThoughtDAG

### Browser demo

The [hosted demo](https://app.thoughtdag.workers.dev) is useful for a quick look, but it is a feature subset and cannot access local desktop sessions or folder backup.

### Run from source

```bash
npm install
npm run server
npm run dev
```

Open `http://localhost:5173`. You can configure an OpenAI-compatible endpoint inside the app, so an `.env` file is optional.
