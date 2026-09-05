---
title: Feature status
---

# Feature status

| Capability | Status | Documentation boundary |
|---|---|---|
| Graph conversation and context wires | Current | Core product behavior |
| Branch, merge, prune, regenerate, and replay | Current | Demonstrate with controlled before/after context |
| PDF reading and extraction | Current | Preserve source and page provenance |
| Local storage, backup, export, and sharing | Current | Do not promise unverified compatibility across every version |
| Session Atlas for supported local sessions | Desktop app and Harness plugin | Codex, Claude Code, and DeepSeek Harness adapters; runner formats may change |
| Incremental session mirrors and tool-result attachments | Current | Curating a mirror does not rewrite source history |
| Why layer CLI and read-only MCP | Published, experimental | Candidate explanations are not verified causes |
| Embedded Harness canvas and Agent turns | Plugin 0.4.4 published | Regular-model answers stay on the canvas; Agent mode records real Harness turns |
| Native Harness why tools and /why | Implemented on main; awaiting npm release | Not included in dsh-thoughtdag@0.4.4 |
| Context Bundle v0 | Experimental proposal | Runnable fixtures do not make it a frozen compatibility standard |
| Automatic multi-agent orchestration | Not a current product promise | Do not imply that Atlas schedules agents |
| Rewriting existing source-agent history | Not supported | Appending a new Harness turn is not rewriting old logs |

“Implemented,” “experimental,” and “proposed” are different claims. A successful local demonstration does not prove stable compatibility with every external tool.
