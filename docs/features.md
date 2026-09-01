# Complete feature index

[中文](/zh/features) · [Guide map](/guides/)

This is a scan of current product areas. The feature guides explain how to use them; [Feature status](/reference/feature-status) separates current behavior from experimental directions.

## Canvas and navigation

- Multiple canvases with create, rename, switch, archive, and delete flows.
- Infinite canvas with middle/right-drag panning, wheel zoom, node movement, and box selection.
- Three semantic zoom levels: full cards, takeaway plaques, and icon-level markers.
- Minimap, zoom controls, frame navigator, node search, structural arrow-key navigation, and root-path highlighting.
- **Tidy layout**, local **Align**, frames, annotations, undo, and redo.

Guide: [Canvas, navigation, and frames](/guides/canvas-projects)

## Conversation nodes and floating panel

- One node stores a question, answer versions, model provenance, role, highlights, and attachments.
- Continue a path, **Explore** from selected text, edit questions and answers, or regenerate in place or as a sibling node.
- Floating panel for reading, version switching, attachments, highlights, merge order, grouped context tree, and follow-up input.
- Right-click node menu for panel/reading access, regeneration, summarizing to a note, copying, CLI continuation, duplication, archiving, and deletion.

Guide: [Conversation nodes and panel](/guides/conversations)

## Wires and model-visible context

- Purple solid conversation paths, orange structural exploration branches, purple dashed summary references, and red dashed reviewer relationships.
- **Will send** preview grouped into materials, references, and conversation turns.
- Delete or convert a wire without deleting its nodes; archive content to exclude it while retaining it.
- Context fingerprints, stale markers, answer versions, and dependency-ordered replay.
- Controlled comparison by regenerating the same question and model after a context change.

Guide: [Control context](/guides/context-control) · [Versions, staleness, and replay](/guides/versions-replay)

## Material nodes and reader

- PDF, image, HTML, DOCX, Markdown, text, code, and link-snapshot materials within current [input boundaries](/reference/supported-inputs).
- Original/text/digest views where available; document recognition and editable extracted text.
- Ask from selected text or a selected visual region, save a passage or image as its own node, and preserve page provenance.
- Reading rail for source-grounded question chains, with jumps between source, answer, and canvas node.
- Material overview and inherited attachment controls.

Guide: [Material nodes and reader](/guides/materials)

## Organize and review

- **Merge summary**, **Merge & delete**, **Weave highlights**, structured highlights, and multiple downstream highlight modes.
- Condensed copy of consecutive unbranched runs while preserving the original path and protected decisions/pivots.
- Sliding reviewer nodes, graph diagnostics, and manual or automatic refresh of dependent work.

Guide: [Merge, highlight, and condense](/guides/organize)

## Models, tools, roles, and memory

- Runtime provider presets, OpenRouter sign-in, Ollama, custom OpenAI-compatible endpoints, `.env` providers, and supported plan connections.
- Global model selection and node-level model pinning; model provenance stored per answer version.
- Web search, scholarly search, vision routing, and local/remote MCP tools.
- Inherited/set/reset node roles and editable role library.
- Visible ambient-memory admission for preferences, user-stated identity, and project facts, with undo and global controls.

Guide: [Models, tools, and memory](/guides/models-tools) · [Connect a model](/setup)

## Session Atlas

- Discover supported local Codex and Claude Code sessions by project folder.
- Read-only graph mirrors with conversation nodes and inspectable tool-result attachments.
- Incremental append, changed-session filters, multi-session canvas mounting, re-mirroring, and source-status indicators.
- **Sources** management and optional one-command handoff from supported agents.

Guide: [Session Atlas](/guides/session-atlas)

## Toolbar, menus, and data

- Toolbar access to models, replay, frames, search, language, backup, overflow actions, undo, and redo.
- Overflow menu for annotation visibility, layout, highlight/material overviews, condense, diagnostics, sharing, exports, appearance, memory, and tutorial.
- IndexedDB persistence, automatic folder backup, complete JSON import/export, selected/context-chain Markdown, event CSV, and read-only URL sharing.

Guide: [Interface overview](/guides/interface-overview) · [Data, backup, and sharing](/guides/data-sharing)
