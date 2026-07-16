<div align="center">

<img src="public/favicon.svg" width="88" alt="ThoughtDAG logo"/>

# ThoughtDAG

**思考值得一张地图。**

在无限画布上，AI 对话长成一张可编辑的思维图。

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072)
![License](https://img.shields.io/badge/许可-MIT-green) ![Status](https://img.shields.io/badge/状态-活跃开发中-6B5CE7)

[English](./README.md) · [快速开始](#快速开始) · [功能总览](#功能总览) · [支持的模型](#支持的模型) · [Roadmap](#roadmap)

<img src="docs/hero-zh.png" alt="ThoughtDAG 全景：六节点地图——对话主链、探索分支、红色虚线上的评审——每张门牌带认知徽章（排除、决策、转向、待解）；右侧侧栏展示决策节点在继承的「认知科学教练」角色下的完整 deepseek-v4-pro 回答，以及附件、高亮、按 token 计价的上下文链" width="100%"/>

</div>

## 为什么

聊天是线性而不透明的：对话越长上下文越稀释，说过的话删不掉，你也永远不知道模型到底读了什么。ThoughtDAG 把对话铺成一张图：问题是节点，连线是上下文，编辑图，就是在编辑模型的记忆。让思考长成图，而不是一条线。

## 快速开始

```bash
npm install
npm run server         # LLM 代理
npm run dev            # → http://localhost:5173
```

不用配置也能开始：`.env` 里没有 key 时，应用会在浏览器里请你填一把 OpenRouter key（只存 localStorage 和代理内存，不落盘）。也可以把 `.env.example` 复制成 `.env` 填任意服务商的 key——`ZHIPU_API_KEY` 免费（open.bigmodel.cn）。

首次打开是预置的示例画布：围绕一个日常问题（收藏夹为什么总在吃灰）展开四章，从对话语法到一份内嵌真 PDF 的阅读闭环。缩小画布看看——上面的 hero 图就是这张画布的地图形态。最快的入口：把一篇 PDF 拖到首页，从阅读开始。智谱 key 同时驱动联网搜索（引擎档位在模型菜单里可切换）；学术检索（arXiv + Semantic Scholar）免费、不需要任何 key。

## 删一条边，换一个答案

模型只看到连进节点的内容——整个产品就这一条法则。而这条法则是可检验的：提示词一字不动，只改一条线，看回答怎么变。

<img src="docs/prune-zh.gif" alt="真实录屏：总结节点同时连着研究主链和无关的晚饭节点，噪音漏进回答；点选噪音边、删除、重新生成，同一提示词返回干净的总结" width="100%"/>

*一个总结节点、两个上游——晚饭计划漏进了回答。删掉噪音那条边，重新生成，同一句提示词返回干净的总结。录屏来自真实应用（内容预载，方便任何人检查上下文）；机制是产品真实行为——在示例画布第 ③ 区可以亲手复现。*

## 把文献读成思维地图

拖入 PDF，读的是原版页面。圈选一段、直接提问：答案在文档旁边流式出现，问题带着页码落在画布上、连着材料。问过的段落会在页面上留下印记——一道高亮和一个重开对话的气泡，读完整篇之前，问过的一切都在原地等你。这条路是双向的：回到画布，节点上的 p.N 芯片一键跳回阅读器的那一页。

一键生成导读：一篇你的语言写成的短篇结构化导读，每个要点都锚着页码跳转按钮。导读本身就是一个节点——把它连向下游，后续问题就以材料的最佳压缩为上下文，而不是整份原文。扫描件一键重排为可读的 Markdown，公式也认。

<img src="docs/reading-zh.gif" alt="真实录屏：在原版 PDF 页面圈选一句话提问，答案在批注栏流式出现，段落留下气泡印记，然后生成带页码跳转的导读" width="100%"/>

## 核心手势

**选中文字 → 探索 → 分支从这段文字里长出来。** 新节点只继承你选中的内容，主链保持干净。

## 功能总览

| | |
|---|---|
| 🧠 上下文编辑 | 拖线合并分支、删线裁剪记忆、归档的节点退出一切未来上下文 |
| 🔗 引用 | 虚线只引一个节点的问答，不拖整条对话；引用⇄全量随时切换，价格全程可见 |
| 🧹 收敛 | 框选冗余节点，合并成一个结构化综合，原件归档 |
| 🗺️ 地图视图 | 缩小画布，每张卡显示一行收获句，关键动作带徽章：✕ 排除 · ⚖ 决策 · ↩ 转向 · ? 待解 |
| 📖 阅读闭环 | 问过的段落在 PDF 页面留印记，画布节点用 p.N 芯片跳回原文；一键导读，导读即节点、可连下游 |
| 🧭 陈旧与重放 | 上游一改，被影响的回答立刻亮标记；按依赖顺序批量重放，先报 token 价 |
| 🩺 拓扑体检 | 一键揪出结构病（重复通路、盲评破盲），每条发现带定位和一键修复 |
| 🧪 范式 | 可复用的人机工作流；改个输入、一键重放，整个实验重跑一遍 |
| 👁️ 随动评审 | 批评者沿着思路自动前移，每一步新内容都被重新评审，历史成版本 |
| 🔍 Agentic 检索 | 网页、arXiv、Semantic Scholar，行内引用；何时检索由模型自己判断 |
| 🔌 模型自由 | 九家 provider 填 key 即用，节点级切换模型，Ollama 完全本地离线 |
| 🎭 角色 | 节点级 system prompt 沿链继承，角色库可自行增删改 |
| 🔒 本地优先 | 浏览器 + 你自己机器上的轻代理；备份是你完全拥有的 JSON 文件 |

<details>
<summary><b>📜 完整功能清单（按领域分组）</b></summary>

### 画布与上下文——唯一法则一族

- **DAG 上下文引擎**: `buildContext()` 遍历所有入边，拓扑序构建对话历史
- **分层上下文组装**: 材料 → 引用块 → 对话，顺序与连线先后无关（同一张图、同一份 prompt）
- **紫色边**（继续追问）：继承完整祖先上下文
- **橙色实线**（分支探索）：选中文字 → 向右分支，探索性提问；实线永远=结构，虚线永远=旁路（引用 / 评审）
- **引用边（虚线）**: 手拖连线落在任意节点=引用它（问答+上游来路），不拖整条对话；深度是边的一等属性：选中边或在面板上下文树里都能切 引用⇄全量，连线 toast 同时报出两档价格（源头无上游链时不打扰）
- **「将发送」预览**: 提问前实时显示 ~N tok · M 条消息 · K 个文件，并按 材料 · 引用 · 对话 三层拆解
- **连线点选删除**: 点击连线选中，浮出删除按钮；右键菜单同样可删；Cmd+Z 撤销
- **归档（裁剪但保留）**: 画布上变暗、退出一切上下文遍历、可恢复；多选批量归档
- **合并综合**: 框选节点 → 结构化综合（结论 / 证据 / 未解问题）
- **高亮系统**: 三种下游传递模式：📄 全文 / 🏷️ 标记重点 / ✂️ 仅传高亮；编辑后自动清理失效高亮
- **节点角色系统**: 节点级 system prompt 三种模式（继承 / 为下游设定 / 此处重置），生成时记录 `appliedRole`，多父冲突有单选器
- **角色库可自行编辑**: 内置角色+自定义角色；管理器中增删改（改内置=生成你的副本，可随时还原）；已应用的角色冻结在节点上
- **Token 计数**: 每节点用量显示

### 阅读与材料

- **材料阅读器**: 原版 PDF 渲染+可选中文字层（pdf.js）；圈选→提问=支线节点带 `(p.N)` 出处，段落在页面留下锚点（高亮洗染+重开对话的气泡）；画布节点带 p.N 芯片反向跳回阅读器；扫描件回退提取文本视图；底部对话索引给每条线程标注 p.N 或整篇；每份材料记住滚动位置
- **批注栏**: 答案在文档旁流式出现；追问接成链；在答案里圈选可探索（挂在该回答下）或加高亮；chips 切换线程，十字跳画布
- **导读**: 一键把材料整理成 UI 语言的短篇结构化导读，(p.N) 按钮跳回原文页；导读本身是画布节点（重写即版本、标注生成模型、可连下游作为材料的压缩表示）；重新生成走导读专用 prompt 对全文执行
- **识别（扫描件）**: 逐页视觉重排为 Markdown/LaTeX，可编辑；外部 OCR 工具的输出可直接贴入
- **内容节点**: 便签（markdown）、带 PDF 封面的文件节点、带时间戳的链接快照；粘贴即建；图像自动识读用最强的已配置视觉模型；所有材料都在阅读器中打开
- **附件系统**: 节点级附件（拖拽/粘贴/上传）、继承的包含/排除控制、指纹去重、图片自动切换视觉模型；PDF 以提取文本进入上下文，文件节点穿首页封面
- **材料优先首页**: 文档拖到首页=材料节点+阅读器自动打开；给根问题带附件走显式回形针

### 地图与回顾

- **地图模式**: 缩放低于 ~0.8 时卡片渲染为收获句标签牌（pill 圆角+类型色描边）；滞回防抖动；等人输入的节点和运行中的范式保持工作形态
- **类型化收获句**: 每个回答版本一行结论先行的总结，自动分类（✕ 排除 · ⚖ 决策 · ↩ 转向 · ? 待解；普通洞见不打标）；纯显示层，永不进上下文与指纹
- **陈旧追踪**: 每次生成记录上游指纹；节点亮琥珀徽章、上下文树打点、下游载荷带 [Stale] 标记
- **批量重放**: 一键按依赖顺序重跑全部陈旧节点；确认框带 token 估算；随时停止
- **版本管理**: 原地重新生成=追加可对比版本（翻页/删除/切回，下游陈旧随当前版本联动）；「另开分支重答」生成平行兄弟做 A/B
- **拓扑体检**: 按需诊断，确定性发现（残差实线/影子引用/盲评破盲/候选不对称）+ 观察项（巨链/开放支线/坍缩点）；定位跳转+一键修复
- **Cmd+F 节点搜索**: 按问题/回答/收获句过滤，方向键+Enter 跳转平移画布
- **祖先边高亮**: 选中节点到根的路径变金色，其余变暗

### 生成与自动化

- **流式回答**: SSE 逐 token 渲染+闪烁光标，节点和面板同步；停止保留已生成内容；失败显示重试（错误进 toast，不进回答）
- **随动评审**: 红色滑动边上的批评者角色；每一步新内容自动重新评审，历史成版本；评审是普通节点（可追问、可分支）
- **范式模式**: human/prompt 步骤+材料槽位；实例化 → 级联 → 解锁；改输入+重放=重跑整个实验；评审轮数在文件里声明、有界
- **环境记忆**: 后台判官保存长期事实，写入有可见 toast+撤销；一个全局开关（默认开）、管理器支持粘贴导入和 JSON 导出；机器步骤和导读不注入记忆
- **全部可编辑**: 双击编辑问题或回答；文字选择工具栏（分支 / 高亮）

### 模型与检索

- **模型自由**: 九家 provider 填 key 即注册；工具栏切换随时生效；带图请求自动改道视觉模型
- **浏览器端 API key**: 不碰 `.env` 也能用——在应用里粘贴一把 OpenRouter key（只存 localStorage+代理内存，不落盘）；没有任何模型时对话框自动弹出
- **节点级模型覆写**: 任意节点可钉住自己的 LLM（卡片带徽章，兄弟重答继承）；探索用便宜模型、关键步骤上旗舰；每个版本记录由哪个模型生成
- **Agentic 检索**: AI SDK 工具循环：网页搜索 + arXiv + Semantic Scholar（免费 API），`[n]` 行内引用+持久化参考文献，保底综合回答，工具栏分组开关
- **MCP 工具生态**: `mcp.config.json`（stdio + HTTP/SSE 两种传输）；工具加入 agentic 循环、逐调用进度；附带测试用 mock server
- **能力面板**: 搜索引擎档位、学术检索状态、视觉模型偏好、记忆开关集中一处，在模型选择器脚部

### 工作台与数据

- **无限画布**: 平移、缩放、自由拖拽节点（React Flow）
- **列树自动布局**: 主链向下、分支向右；用实测高度防重叠；随时可整理布局/对齐所选
- **分区框**: 带标签的彩色区域+导航跳转列表；可隐藏批注视图
- **Focus 浮层面板**: 悬浮于画布之上（画布永不让位）的白卡阅读布局、按 材料/引用/对话 分组的上下文树、追问输入；宽度可拖拽
- **Markdown + LaTeX 渲染**: 完整 markdown、代码高亮、行内与块级公式
- **多选操作**: 框选节点：合并综合 / 合并删除 / 对齐 / 导出 / 删除
- **数据持久化**: IndexedDB 自动保存（1 秒防抖）、刷新不丢；多画布项目（新建/切换/重命名/删除）
- **导出系统**: 整图 JSON 备份与导入；上下文链/多选 Markdown 导出；记忆和角色同样可导出——easy in, easy out
- **导入 ChatGPT / Claude 会话**: conversations.json 拖进导入；编辑/重新生成分支保留为图的分叉，每个对话成为独立画布
- **撤销/重做**: Cmd+Z / Cmd+Shift+Z，完整状态快照
- **键盘快捷键**: Space 折叠、R 重新生成、方向键走图、Esc 逐层退出（教程里有图例）
- **中英双语**: 自动检测浏览器语言，一键切换
- **内置教程**: 十步图解，从提问到范式
- **首次打开自带示例画布**: 围绕一个日常问题的四章预置图——对话语法、材料与引用、⚖️ 上下文裁剪对比、内嵌真 PDF 的阅读闭环（锚点问题+导读节点）；每个节点带类型化收获句，缩小即得一张能用的地图；landing 可随时重新载入

</details>

## 设计哲学

聊天终端是执行的 harness：为「把答案递给你」而优化，其余一切都被隐藏。ThoughtDAG 是认知的 instrument：价值单位是推理结构本身，保持可读、可编辑、可复现。

*图无环，环是人。*

## 成本与隐私

- **免费可用。** 智谱免费档（GLM-4.5-Flash 文本 + GLM-4V-Flash 视觉）覆盖全部功能；联网搜索约 ¥0.01/次。也可以接任何你已付费的模型，或本地 Ollama 完全离线。
- **数据在你手里。** 画布存在浏览器 IndexedDB；唯一的服务端是你自己机器上的轻代理。除了你选择的 LLM API，任何数据不上传任何地方。备份是你完全拥有的 JSON 文件。
- 可选：PDF 页图渲染需要 poppler（`brew install poppler`），缺失时自动降级纯文本。

## 支持的模型

基于 Vercel AI SDK。下表任何一家，把 key 填进 `.env` 即自动激活——或者完全跳过 `.env`，在应用里粘贴一把 OpenRouter key；工具栏随时换模型，纯文本模型遇到图片自动改道视觉模型。各家默认模型 id 可用环境变量覆盖（如 `OPENAI_MODELS=gpt-5.2`）。

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

## 技术栈与架构

| 层级 | 技术 |
|------|------|
| 界面 | React 19 + TypeScript + Vite 7 |
| 画布 | @xyflow/react (React Flow) |
| 状态 | Zustand（persist → IndexedDB via idb-keyval）|
| 样式 | Tailwind CSS v4 |
| 大模型 | Vercel AI SDK：9 家 provider，按 .env key 自动注册（见[支持的模型](#支持的模型)）|
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

## Roadmap

**近期**
- [ ] 事件日志导出（画布操作序列 → CSV/JSON，人机交互研究的测量层）
- [ ] 任意画布另存为范式（反向实例化）
- [ ] 附件 blob 分离（图片密集画布的规模化）

**长期**
- [ ] 运行对比视图（同一范式 N 次运行并排）
- [ ] Artifact 节点（画布上的文件产出，Monaco 编辑器 + 版本历史）
- [ ] 异步协作：分享范式、回收运行

## 如何引用

如果 ThoughtDAG 在你的研究中发挥了作用，请引用它（GitHub 的 "Cite this repository" 按钮会读取仓库内的 `CITATION.cff`）：

```bibtex
@software{thoughtdag,
  author = {Chen, Xia},
  title  = {ThoughtDAG: an instrument for legible human-AI collaboration},
  url    = {https://github.com/chenxiachan/thoughtdag},
  year   = {2026},
  license = {MIT}
}
```

## 反馈

ThoughtDAG 是一个活跃开发中的早期项目，正是反馈最有价值的时候：

- ⭐ 觉得这个思路有意思？**点个 Star**，这真的很有帮助
- 🐛 遇到 bug 或不顺手的地方？[提个 issue](https://github.com/chenxiachan/thoughtdag/issues)
- 💡 关于「用图思考」的想法？[来 Discussions 聊聊](https://github.com/chenxiachan/thoughtdag/discussions)

## 许可

[MIT](./LICENSE) © 2026 Xia Chen
