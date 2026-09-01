# Interface overview

Use this page to locate the main areas of the app. The labels and gestures below match the current desktop interface and built-in example canvas.

![ThoughtDAG interface overview](/screenshots/interface-overview/en/interface-overview-en-annotated.png)

> The red labels and dashed leaders are documentation overlays, not part of the ThoughtDAG interface. Open the [unannotated screenshot](/screenshots/interface-overview/en/interface-overview-en.png) to inspect the original UI.

## 1. Toolbar

The canvas entry at the upper left switches projects and opens [**Session Atlas**](/guides/session-atlas). The upper-right toolbar shows controls relevant to the current canvas:

- [**Model picker**](/guides/models-tools#connect-and-select-a-model), including model and capability configuration;
- [**Replay stale**](/guides/versions-replay#replay-dependent-work), shown only when stale nodes exist;
- [**Frame navigator**](/guides/canvas-projects#use-frames), shown only when frames exist;
- [**Search nodes**](/guides/canvas-projects#find-a-node), language, and [**Local auto-backup**](/guides/data-sharing#automatic-folder-backup);
- [**More actions**](#more-actions-menu), [undo and redo](/guides/data-sharing#recover-changes).

### **More actions** menu

The upper-right **⋯** contains lower-frequency canvas-wide actions:

| Menu item | What it does |
|---|---|
| [**Show / Hide annotations**](/guides/canvas-projects#use-frames) | Temporarily shows or hides frames and unlinked material. This changes only the view; it neither deletes content nor changes model context. |
| [**Tidy layout**](/guides/canvas-projects#arrange-the-graph) | Rearranges node positions along wire direction after confirmation. It changes layout only. |
| [**All highlights**](/guides/organize#highlight-and-weave) | Collects every highlight on the canvas for locating, weaving, or Markdown export. Appears only when highlights exist. |
| [**All materials**](/guides/materials#other-material-flows) | Lists files, images, links, and other material nodes and locates them on the canvas. Appears only when material exists. |
| [**Condense**](/guides/organize#condense-a-path) | Finds conversation runs whose granularity can drop and creates a condensed copy beside the original graph. The original stays unchanged. |
| [**Diagnose canvas**](/features#organize-and-review) | Reports structural issues such as residual edges, shadow references, blind-pool breaches, and unusually long chains; it does not silently repair them. |
| [**Share read-only link**](/guides/data-sharing#share-a-read-only-graph) | Runs a sensitive-content check, then creates a read-only viewer link. Recipients can browse but cannot modify the source canvas. |
| [**Export backup (.json)**](/guides/data-sharing#import-and-export) | Exports the active project's nodes, wires, and content as a local JSON backup for migration or recovery. |
| [**Export event log (.csv)**](/guides/data-sharing#import-and-export) | Exports timestamped asks, generations, highlights, archiving, and other canvas events. Appears only when events exist. |
| **Lighting** | Chooses Light, Dark, or System appearance. |
| **Paper** | Switches between plain and grid paper; grid paper also enables node snapping. |
| [**Memory**](/guides/models-tools#manage-ambient-memory) | Opens cross-canvas ambient memory for viewing, editing, importing, or exporting. When memory is enabled, admitted entries join the system layer of ordinary generations. |
| [**How it works**](/) | Opens the built-in ten-step interaction guide and keyboard shortcuts. |

The menu omits actions that do not apply to the current canvas, so yours may be shorter than the screenshot.

![English toolbar and More actions menu](/screenshots/interface-overview/en/toolbar-more-en.png)

## 2. Canvas

The canvas is the main workspace. Hold the middle or right mouse button and drag to pan, and use the wheel or two-finger scroll to zoom. Left-drag on empty space to box-select, double-click empty space to create a question, and drag a node to reposition it. Selecting two or more nodes opens the [multi-selection toolbar](/guides/canvas-projects#multi-selection-toolbar) at the top. Zoom controls appear at the bottom, and the minimap can also pan and zoom the view. See [Canvas, navigation, and frames](/guides/canvas-projects) for the complete interaction guide.

## 3. Nodes

The canvas has three main node families:

| Type | What it stores | How to create and open it |
| --- | --- | --- |
| **Question and answer** | One question and its answer versions | Ask a question or continue from an existing answer; double-click the node to open the [floating panel](/guides/conversations#floating-panel-areas) |
| **Note** | Editable text or Markdown | Create a note, or paste ordinary text onto the canvas |
| **Material** | PDFs, images, Word `.docx`, HTML, Markdown, plain text and common code files, plus web snapshots | Drop or paste a file; pasting a single web URL stores the fetched page and timestamp; double-click to enter the [material reader](/guides/materials#understand-the-reader) |

A question-and-answer node stores one question and its answer versions. **Double-click the question** to edit it; use the **pencil button** at the end of an answer to edit that answer. **Right-click a node** for its action menu; see [Conversation nodes and panel](/guides/conversations#node-right-click-menu).

### Semantic icons on question-and-answer nodes

After a longer answer finishes, ThoughtDAG generates a short map summary in the background and classifies the role that exchange played in the reasoning. When you zoom out, the node displays the corresponding icon:

| Icon | Meaning |
| --- | --- |
| **✦** | Insight: learned or confirmed something |
| **✕** | Ruled out: rejected a hypothesis or option |
| **⚖** | Decision: chose among alternatives |
| **↩** | Pivot: reframed the question or direction |
| **?** | Open: left an unresolved question |

These icons are **not additional node types**. They are semantic navigation marks and do not change the node content or automatically change model context. Short or unclassified exchanges remain neutral dots in the farthest zoom tier.

Reviewer and condensed nodes use their own dedicated marks. See [Versions, staleness, and replay](/guides/versions-replay) and [Merge, highlight, and condense](/guides/organize) for their behavior.

![English node right-click menu](/screenshots/interface-overview/en/node-context-menu-en.png)

## 4. Wires

- **Purple solid wire**: primary conversation path carrying full upstream context.
- **Orange solid wire**: an exploration branch created from selected text; it is still part of the context structure.
- **Purple dashed wire**: summary reference carrying the referenced question and answer plus the upstream question trail.
- **Red dashed wire**: sliding reviewer relationship.

Selecting a convertible wire shows its token estimate and conversion action. You can also delete the wire. See [Control context](/guides/context-control).

## 5. Floating panel

The [floating panel](/guides/conversations#floating-panel-areas) shows the full question and answer, active version, grouped context tree, highlights, references, and a follow-up box. It floats above the canvas without changing node positions.

![English conversation node and floating panel](/screenshots/interface-overview/en/node-panel-en-annotated.png)

The red callouts locate the active node, question, response, context area, and follow-up entry. They are not part of the app UI.

## 6. Follow-up box and context preview

The box at the bottom of the floating panel continues from the active question-and-answer node. A summary line above it reads something like **“will send ~900 tok · 8 messages.”** This is not a separate toolbar button. Click the summary line to expand the [context preview for the next follow-up](/guides/context-control#inspect-the-next-request).

![English follow-up box and Will send summary](/screenshots/interface-overview/en/followup-context-preview-en.png)

The expanded preview groups materials, explicit references, and conversation turns, and shows message and token estimates. This entry belongs only to follow-ups in the node panel. The main ask box used to start the first question on an empty canvas does not show this line.

Continue with [Canvas, navigation, and frames](/guides/canvas-projects), or go directly to [Conversation nodes and panel](/guides/conversations).
