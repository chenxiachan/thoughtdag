# CLAUDE.md

ThoughtDAG：把 LLM 对话变成无限画布上可编辑的思维 DAG（节点=一轮问答，边=上下文流）。React 19 + Vite + TypeScript 前端，Express 代理后端。状态：活跃开发中的开放原型（github.com/chenxiachan/thoughtdag）。

## 常用命令

```bash
npm run dev      # Vite 前端 (默认 5173)
npm run server   # LLM 代理 server.mjs (端口 3001，前端默认指向它)
npm run build    # tsc -b && vite build
npm run smoke    # scripts/smoke.mjs 冒烟测试
npm run lint
```

需要 `.env`（见 `.env.example`）：至少一把 LLM key（`ZHIPU_API_KEY` 免费档 glm-4.5-flash，或 `DASHSCOPE_API_KEY` 付费）。

## 架构

- `server.mjs` — 唯一后端文件：Express 代理，用 Vercel AI SDK（`ai` + `@ai-sdk/openai-compatible` + `zhipu-ai-provider`）调 LLM；含 agentic 网页搜索 + 行内引用（搜索后保证有综合回答）。
- `src/store/` — zustand 全局状态；持久化用 idb-keyval（IndexedDB）。
- `src/components/` — 画布基于 `@xyflow/react`（React Flow）：`ThoughtNode`、`ThoughtEdgeView`、`SelectionToolbar`（圈选对齐，对齐前有确认提示）、`focus-panel/`。
- `src/lib/api.ts` — 前端到 server.mjs 的调用层。
- `src/i18n/` — 中英双语。
- Markdown 渲染：react-markdown + KaTeX + highlight.js；PDF 附件用 pdfjs-dist。

## 约定

- 布局必须遵守箭头（上下文流）顺序，同一对话链节点竖向对齐——这是用户明确要求过的行为，改布局逻辑时不要破坏。
- 与用户交流用中文；代码标识符和注释保持英文。
