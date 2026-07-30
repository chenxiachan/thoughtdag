# 配置与架构

[English](./setup.md) · [返回 README](../README_ZH.md)

## 快速开始（细节版）

最快的路径是[在线 Demo](https://app.thoughtdag.workers.dev)：打开、粘贴一个 key（不粘贴也行，可以先逛示例画布）就能用。模型流量从浏览器直连网关，key 不会经过 Demo 的服务器。想自己跑：

```bash
npm install
npm run server         # LLM 代理
npm run dev            # → http://localhost:5173
```

不用配置也能开始：`.env` 里没有 key 时，应用会请你连接一个模型接口。选一家服务商填 key、接入本地运行的模型（Ollama 等），或者填任何兼容 OpenAI 协议的自定义端点；模型列表从接口现场拉取，key 只存 localStorage 和代理内存，不落盘。也可以把 `.env.example` 复制成 `.env` 填任意服务商的 key，`ZHIPU_API_KEY` 免费（open.bigmodel.cn）。

示例画布在首页一键载入：围绕一个日常问题（收藏夹为什么总在吃灰）展开四章，从对话语法到一份内嵌真 PDF 的阅读闭环。缩小画布，就是 README 里的地图形态。最快的入口：把一篇 PDF 拖到首页，从阅读开始。智谱 key 同时驱动联网搜索（引擎档位在模型菜单里可切换）；学术检索（arXiv + Semantic Scholar）免费、不需要任何 key。

## 支持的模型

基于 Vercel AI SDK。下表任何一家，把 key 填进 `.env` 即自动激活；也可以完全跳过 `.env`，在应用里连接任何兼容 OpenAI 协议的接口（含本地 Ollama）。工具栏随时换模型，纯文本模型遇到图片自动改道视觉模型。各家默认模型 id 可用环境变量覆盖（如 `OPENAI_MODELS=gpt-5.2`）。

> 图片理解需要一把视觉模型的 key。粘贴的图片会被你配置的最强视觉模型自动识读一次，结果是可编辑的伴随文本。免费的 `glm-4v-flash` 可用；旗舰视觉模型读科研图明显更好。

| 提供商 | 默认模型 | `.env` key | 说明 |
|--------|----------|------------|------|
| **智谱 GLM** | glm-4.5-flash · glm-4v-flash | `ZHIPU_API_KEY` | **免费**、国内直连；联网搜索由它驱动 |
| **通义千问** (DashScope) | qwen-plus · qwen-vl-plus | `DASHSCOPE_API_KEY` | 国内直连 |
| **OpenAI** | gpt-5.1 · gpt-5-mini | `OPENAI_API_KEY` | 可用 `OPENAI_MODELS` 覆盖 |
| **Anthropic** | claude-sonnet-5 · claude-haiku-4-5 | `ANTHROPIC_API_KEY` | 可用 `ANTHROPIC_MODELS` 覆盖 |
| **Google** | gemini-2.5-pro · gemini-2.5-flash | `GOOGLE_API_KEY` | 可用 `GOOGLE_MODELS` 覆盖 |
| **DeepSeek** | deepseek-v4-flash · deepseek-v4-pro | `DEEPSEEK_API_KEY` | 纯文本（有图自动改道视觉模型）|
| **Kimi**（月之暗面）| kimi-k2-turbo-preview · kimi-latest | `MOONSHOT_API_KEY` | 国内直连；国际版设 `MOONSHOT_BASE_URL` |
| **OpenRouter** | openrouter/auto | `OPENROUTER_API_KEY` | 一把 key 通 300+ 模型，`OPENROUTER_MODELS` 填任意 `vendor/model` |
| **Ollama** | （你本地的）| `OLLAMA_MODELS=qwen3:8b,…` | 完全本地离线 |

> **联网搜索的可用条件**：OpenRouter 接口自带（网关 `:online`）；其他任何接口，只要同时连接一个智谱 GLM 接口（免费 key 即可），它的 key 就为所有模型驱动搜索引擎。学术检索（arXiv + Semantic Scholar）无需任何条件。

## 订阅接入

按量 API key 不是唯一入口。三家订阅也能接，应用内预设已带好对应端点：

**ChatGPT 订阅（Plus/Pro）**：经社区本地桥接入，本地运行 ThoughtDAG 时可用：

1. 终端运行 `npx openai-oauth@latest`，用 ChatGPT 账号登录一次，桥监听 `127.0.0.1:10531`。
2. 本地运行 ThoughtDAG（`npm run server` + `npm run dev`）。
3. 应用内：模型选择器 → 添加接口 → **ChatGPT 订阅 · 本地** → 获取模型列表 → 保存。用量计入订阅额度，不产生按量账单。线上版连不到你的本机，此通道仅限本地。

**GLM Coding 订阅**：订阅本身发 API key，走专用端点（`/api/coding/paas/v4`，与按量的 `/api/paas/v4` 不通用）。选 **GLM Coding 订阅** 预设，填订阅控制台里的 key 即可。线上版同样可用。

**Kimi Code 订阅**：同样形态。在 Kimi Code 控制台创建 key（最多 5 把），选 **Kimi Code 订阅** 预设填入即可。推荐 `k3-256k`，省配额。线上版同样可用。

> 刻意没有 Claude 与 Gemini 订阅：两家都禁止订阅凭证在第三方工具使用（2026 年已实际执法，有封号案例）。它们的按量 API key 走常规预设，不受影响。

## 成本与隐私（细节版）

- **免费可用。** 智谱免费档（GLM-4.5-Flash 文本 + GLM-4V-Flash 视觉）覆盖全部功能；联网搜索约 ¥0.01/次。也可以接任何你已付费的模型，或本地 Ollama 完全离线。
- **数据在你手里。** 画布存在你的浏览器里；唯一的服务端是你自己机器上的轻代理。除了你选择的 LLM API，数据不会发往任何别的地方。在线 Demo 上，模型流量从浏览器直连网关，key 和对话完全不经过 Demo 的服务器。
- **PDF 不离开你的电脑。** 拖入的文档永远不会以文件形式上传，只有提取出的文本在你提问时发给你选择的模型。未发表的手稿可以放心读。
- **换浏览器不等于丢工作。** 自动文件夹备份把画布写成你指定文件夹里的真实 `.thoughtdag.json` 文件（需要 Chromium 系浏览器，如 Chrome、Edge、Arc；Safari 和 Firefox 用一键手动导出）。备份格式保持向后兼容，Markdown 导出是永远与格式无关的逃生门。
- 可选：PDF 页图渲染需要 poppler（`brew install poppler`），缺失时自动降级纯文本。

## 技术栈与架构

| 层级 | 技术 |
|------|------|
| 界面 | React 19 + TypeScript + Vite 7 |
| 画布 | @xyflow/react (React Flow) |
| 状态 | Zustand（persist → IndexedDB via idb-keyval）|
| 样式 | Tailwind CSS v4 |
| 大模型 | Vercel AI SDK：9 家 provider，按 .env key 自动注册 |
| 代理 | Express + Vercel AI SDK（server.mjs，默认端口 3001）|

<details>
<summary>请求流</summary>

```
浏览器 (localhost:5173)
  └─ React + React Flow 画布
      └─ Zustand store (nodes, edges, history) ⇄ IndexedDB（自动保存）
          ├─ buildContext(nodeId) → 遍历 DAG → ContextMessage[] + images
          └─ src/lib/api.ts
              ├─ llmCallStream(messages) → POST /api/stream（SSE 流式 + 工具事件）
              ├─ llmCall(messages)       → POST /api/claude（非流式，用于摘要）
              └─ extractPdf(base64)      → POST /api/pdf-extract
                        └─ Express + AI SDK (server.mjs) → 智谱 / 通义千问 / 任意 provider
                             └─ web_search 工具（模型自主调用，引用回流）
```

</details>
