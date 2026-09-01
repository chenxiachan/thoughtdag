# Troubleshooting

## The app opens but no model is available

Open **Connect a model** and add a provider, local Ollama, or custom OpenAI-compatible endpoint. Confirm that the endpoint exposes a model list or enter the model name where the interface allows it.

## A request fails

Check the visible error toast, endpoint address, selected model, and credential. Failed generations remain retryable; errors are not inserted into answer text.

## A PDF has no selectable text

The file may be a scan. Use the extracted-text fallback or run recognition, then review the generated text before relying on it.

## A downstream answer is marked stale

An upstream node, edge, or active version changed. Inspect the context difference, then replay only the nodes that still matter.

## A local Agent session does not appear

Session Atlas is a desktop/local feature. Confirm that the supported runner has local session files and that its source is enabled in **Session Atlas → Sources**.

## Windows shows a security warning

Current Windows builds are not signed. Download only from the official site or GitHub Releases and verify that the publisher path matches the project release.
