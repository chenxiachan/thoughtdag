---
title: Supported inputs
---

# Supported inputs

| Input | Direct support | Notes |
|---|---:|---|
| PDF | Yes | Local rendering, extracted text, passage and rectangle questions, page provenance |
| Images | Yes | Pixel input when supported; optional extracted companion text |
| HTML / HTM | Yes | Scripts removed; readable content extracted; slide-like HTML detected as pages |
| Web URL | Yes | Time-stamped snapshot when the page can be retrieved |
| DOCX | Yes | Text extracted locally |
| Markdown, plain text, source code | Yes | Read as text |
| JSON, CSV, YAML and similar text data | Yes | Read as text; no automatic statistical interpretation |
| PPT / PPTX / Keynote / ODP | No | Export to PDF or HTML before importing |
| Legacy DOC and spreadsheets | No | Export to a supported text, PDF, or HTML format |

Supported parsing does not mean every document will yield perfect text. Scanned PDFs may require recognition, and script-rendered web pages may produce incomplete snapshots.
