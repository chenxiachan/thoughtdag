# Connect a model

[中文](/zh/setup) · [Install and quick start](/)

The desktop app puts the common connection routes inside **Connect a model**. Normal use does not require entering an endpoint or editing `.env`: choose a route, authorize or provide a key, then select the models you want.

## Connect inside the app

1. Select **Connect a model** in the toolbar.
2. Choose a provider, coding plan, Ollama, or a custom connection.
3. Follow the in-app authorization flow, or paste the key issued for that route.
4. Select **Fetch models**, enable the models you want to see, and save.

ThoughtDAG supplies the preset endpoint, reads the available catalog, keeps your selection, and exposes the default model in the toolbar. Use the edit button beside a connection later to refresh its catalog or change the enabled models.

## Choose a route

| Your situation | Choose in the app | What remains for you |
|---|---|---|
| You want the shortest start | **OpenRouter** | Authorize in the browser, then choose models in the app |
| You already have a provider API key | That provider preset | Paste the key; the endpoint is already filled in |
| You have a coding plan | Its coding preset | Use the key issued by that plan |
| You run local models | **Ollama** | Start Ollama; the app reads its model catalog |
| You use another compatible service | **Custom endpoint** | Provide its base URL and any credentials it requires |

Current presets include OpenRouter, Zhipu GLM / Z.ai GLM, GLM Coding, Kimi Code, MiniMax, DeepSeek, OpenAI, Google AI Studio, Kimi / Moonshot, Ollama, and custom OpenAI-compatible endpoints. The models shown in the interface depend on the catalog returned by the service and the access available to your account.

## Subscriptions and coding plans

When a plan issues a key for a compatible endpoint, select its preset and paste that key; you do not need to enter its dedicated endpoint manually. GLM Coding, Kimi Code, and MiniMax routes are already included in the app.

A consumer subscription does not necessarily include third-party API access. The **ChatGPT plan** entry is an optional local compatibility route: ThoughtDAG can connect to an adapter that is already running on the same machine, but the current app does not install or start that adapter for you. Without that local setup, OpenRouter, a provider API key, or local Ollama is the more direct route.

## Local models with Ollama

Start Ollama, then choose **Ollama → Fetch models** in **Connect a model**. The default local address is already supplied and no key is needed. Other local runtimes can be added through **Custom endpoint**.

Model requests sent to a local endpoint remain on that route. If web search, scholarly search, or another remote tool is enabled, that tool still receives its corresponding query.

## Models, vision, and tools

- The toolbar model is the default for new nodes.
- A node can pin another model, and each answer version records the model actually used.
- Image input needs a vision-capable model or companion text extracted for a text model.
- Web search, scholarly search, and MCP tools are separate capabilities; switching models does not change which graph paths enter context.

Continue with [Models, tools, and memory](/guides/models-tools) or [Privacy and storage](/reference/privacy-storage).

## Connection mechanism for developers

An in-app connection is not a separate model protocol. It turns a compatible endpoint into a runtime model catalog for ThoughtDAG:

```text
Provider preset / custom endpoint
        ↓ Fetch models
Compatible /models catalog
        ↓ User selects and saves
Browser connection data and model selection
        ↓ Generate
Runtime model registry → selected endpoint
```

### Presets and model discovery

A preset mainly carries a stable base URL, the route for obtaining a key, and a small recommended set. It does not hard-code the complete model catalog into the interface or documentation. **Fetch models** asks the endpoint's `/models` route through the local or desktop proxy; only connections without that route use a preset catalog. Refreshing a connection reads the catalog again while retaining user selections that remain valid.

### Runtime registration and request path

Confirmed connections and model selections are stored in the current browser configuration. At generation time, ThoughtDAG maps the model ID recorded on the node back to its connection:

- Desktop and local runs normally use the proxy running with the app before reaching the selected endpoint.
- On the hosted build, a small set of compatibility-tested connections can use a browser-direct route; other capabilities depend on the deployment path.
- Runtime connections build a request-scoped model mapping without rewriting server providers registered through `.env`.
- Keys are not written into normal canvas backups. See [Privacy and storage](/reference/privacy-storage) for the data boundary.

### `.env` and custom extensions

A source deployment can still connect providers entirely through the interface. Copy `.env.example` to `.env` only when the server should register providers at startup. Interface connections are added to that startup catalog for the current user; an already registered server model wins if IDs collide.

A custom service must expose compatible model-list and generation interfaces. Its catalog, capabilities, limits, pricing, and data handling are determined by that service. Additional MCP servers are configured separately in `mcp.config.json`.

## Connect local agent sessions

Model connections answer “which endpoint generates this response.” Session Atlas brings local agent sessions into a mirror canvas that you can inspect and reorganize. In the desktop app, **Session Atlas → Sources** can re-detect directories and **Enable/Update** the command that opens a session in ThoughtDAG.

[Open the Session Atlas guide](/guides/session-atlas#configure-sources-and-handoff)
