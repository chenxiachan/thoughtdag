<div align="center">

<img src="public/favicon.svg" width="88" alt="ThoughtDAG logo"/>

# ThoughtDAG

### 让思考长成图，而不是一条线

**在无限画布上，把 AI 对话变成可编辑的思维图谱。**

**唯一法则：连线即上下文。模型读到什么，你看得见、也改得了。**

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072)
![License](https://img.shields.io/badge/许可-MIT-green) ![Status](https://img.shields.io/badge/状态-活跃开发中-6B5CE7)

[English](./README.md) · [快速开始](#快速开始) · [核心特性](#核心特性) · [Roadmap](#roadmap)

<img src="docs/hero.png" alt="ThoughtDAG 画布：紫色主链、橙色探索分支、红色评审者监听边、带引用来源的回答" width="100%"/>

</div>

---

## 看它怎么用

<img src="docs/demo.gif" alt="选中回答中的文字，点 Explore，橙色分支节点带着选中内容作为上下文流式生成" width="100%"/>

*核心手势：选中回答里的任意一段文字 → **Explore** → 一条橙色分支从这段文字里长出来、流式生成回答，并且永远不污染主链。*

## 两分钟跑起来

```bash
npm install
cp .env.example .env   # 一把 key 就够：ZHIPU_API_KEY 免费（open.bigmodel.cn）
npm run server         # LLM 代理
npm run dev            # → http://localhost:5173
```

首次打开会载入**预置示例画布**（包括下方的 ⚖️ 上下文裁剪演示），不用输入任何东西就能感受这个工具。有 ChatGPT 或 Claude 的聊天记录？**导入 `conversations.json`**，你自己的对话立刻变成可编辑的图（分支保留）。

## 为什么需要 ThoughtDAG？

所有主流 LLM 界面都是**线性的、只能追加的、不透明的**：对话越长上下文越稀释、删不掉任何一句；并行探索就会失去关联；而模型到底看到了什么，你从头到尾无法控制。

对话不是列表，是**图**。

还有一层更深的分野。聊天终端是**执行的 harness**：为「把答案递给你」而优化，其余一切都被隐藏：什么进了上下文、如何被压缩、哪个 agent 做了什么。ThoughtDAG 是**认知的 instrument**：价值单位不是答案，而是推理结构本身：什么流了进来、谁影响了谁、此后什么变了、整次运行能否复现。Agent 越强大、越黑箱，你越需要一张让人机协作保持**可读**的工作台。

## 唯一法则：连线即上下文

**节点** = 一轮问答。**边** = 上下文流向。模型只看到连进来的内容。**加边即注入、删边即裁剪**，每次提问前「~N tok · M messages」实时预览要发送的载荷。

**眼见为实**：同一个问题问两次：A 节点继承了无关的做饭闲聊，它直接漏进回答；B 节点通向噪音的边被删掉：

<img src="docs/context-compare.png" alt="同一个问题、两种上下文：带噪音边的回答混进了晚饭计划；删掉后总结保持纯技术" width="100%"/>

*左：一个无关节点连进问题 A。右：A 的回答吸进了噪音（加粗处），而 B（同一个问题、删掉噪音边）保持干净。*

## 核心特性

### 🧠 上下文，可见且可塑
拖线合并分支、删边裁剪记忆、折叠节点改传摘要，每条边都是一次上下文决策。边有两种：**实线=对话**（完整历史流入，排版与范式沿它推进）；**虚线=引用**：只带那个节点的问答与上游来路，选中可见 token 价签、可切换 引用⇄全量。上下文按层组装（材料 → 引用块 → 对话），同一张图永远产出同一份 prompt。

### 📥 解锁你的对话资产
导入 ChatGPT / Claude 的 `conversations.json`：每个对话一张可编辑画布，ChatGPT 的编辑/重生成分叉保留为可见分支。

### 🌿 随处分支
选中任意文字 → 分支从这段文字里长出来；重新生成原地追加版本（可翻页对比、可切回）；「另开分支重答」一键生成平行兄弟做 A/B；跨分支拖线合并。

### 🧹 收敛，而不是堆叠
冗余探索不可避免，但把它留在上下文里不是必然。框选杂乱的节点 → **合并综合**产出结构化整合（结论 / 依据 / 未决问题）→ **归档**原节点：留在画布上、淡化显示、从此不进任何上下文。

<img src="docs/converge.gif" alt="框选三个冗余节点，合并成综合节点，归档原件" width="100%"/>

### 📌 万物皆可上画布
直接粘贴：文字变便签（Word 表格自动转 Markdown）、网址变带时间戳的网页快照、图片**自动识读进上下文**（表格/图表/科研图，识读文本可查看编辑）。便签、文件、彩色分区框都住在画布上，但**不连线，不进上下文**。

### 🧭 陈旧看得见，重放有报价
每个回答都记录它所依赖内容的指纹。上游一改，受影响的回答亮起琥珀**「上游已变」**徽章，陈旧沿引用边同样传染。点徽章原地重放（旧版本保留可对比），或**按依赖顺序批量重放**，确认框先报 token 价。运行 **manifest** 一键导出（模型/指纹/时间戳/陈旧标记），methods 章节直接引用。

### 🧪 范式：把推理工作流跑成实验
工作流只设计一次：human 步等人输入、prompt 步沿实线自动级联、材料槽放实验材料。实例化即运行：机器步自动推进，在每个该有人的位置暂停。跑完改输入 → 全链亮徽章 → 一键重放 = 重跑实验，每步追加可对比版本。存成 `.paradigm.json` 即可分享，内置「排除 / 确认」示例。

### 🔁 活节点与受控循环：一个原语，无数工具
任意节点都可以开启**自动重跑**：上游一有变化就重新生成自己。与角色组合，这一个开关就能长出审稿人、活摘要、随动翻译、常驻研究问题，不需要为每个场景单独造功能。**审稿人预设**一键完成组装：批评者人设 + 一条随思路延伸自动前移的红边，每一步新内容都会被重新评审（历史成版本）。而且审稿人就是普通节点：你可以反问它的批评、从批评里分支、把它连到任何地方。把批评者**连回**写作者并调高轮数预算（×3、×5……），就得到一个**受控的自我改进循环**：起草 → 批评 → 修订，一次点击自动迭代、预算用尽确定性停止。全局暂停开关随时叫停一切自动化。

### 🔍 Agentic 检索：联网 + 学术
模型自主判断何时检索：事实走网页，**论文走 arXiv + Semantic Scholar**。`[n]` 行内引用随节点持久化，工具栏分组开关。

### 🗂️ 科研级工作流
多画布、自动保存、JSON/Markdown 导出、附件继承精确控制（图片 Vision / PDF 双通道）、9 家模型 + 节点级切换、双语界面、内置十步教程。

<details>
<summary><b>📜 完整功能清单（60+ 项）</b></summary>

- **无限画布**: 平移、缩放、自由拖拽节点（React Flow）
- **DAG 上下文引擎**: `buildContext()` 遍历所有入边，拓扑序构建对话历史
- **紫色边**（继续追问）：继承完整祖先上下文
- **橙色边**（分支探索）：选中文字 → 向右分支，探索性提问
- **引用边（虚线）**: 手拖连线落在任意节点=引用它（问答+上游来路），不拖整条对话；选中边见 token 价签，可切 引用⇄全量
- **连线点选删除**: 点击连线选中，浮出删除按钮；右键菜单同样可删；Cmd+Z 撤销
- **原地重新生成**: 追加可对比版本（翻页/删除/切回，下游陈旧随当前版本联动）；「另开分支重答」在 ⋯ 菜单，生成平行兄弟做 A/B
- **全部可编辑**: 双击编辑问题或回答
- **文字选择工具栏**: 选中回答中的文字 → 分支 / 高亮
- **Markdown + LaTeX 渲染**: 完整 markdown、代码高亮、行内与块级公式
- **版本管理**: 在回答版本间导航，删除差的版本
- **Focus 浮层面板**: 悬浮于画布之上（画布永不让位）的白卡阅读布局、按 材料/引用/对话 分组的上下文树、追问输入；宽度可拖拽
- **高亮系统**: 三种下游传递模式：📄 全文 / 🏷️ 标记重点 / ✂️ 仅传高亮
- **编辑自动清理失效高亮**
- **撤销/重做**: Cmd+Z / Cmd+Shift+Z，完整状态快照
- **Column-Tree 自动布局**: 主链向下、分支向右分列，真实测量高度防重叠
- **一键排版 / 圈选对齐**: 按箭头顺序整理全图（确认框防误触）；多选 Align 堆叠成列
- **折叠/展开**: 折叠节点传摘要不传全文（上下文压缩），下游自动平移
- **节点自动摘要**: 后台 LLM 生成，折叠态显示
- **语义缩放**: 缩小画布节点切大字缩略卡
- **Token 计数**: 每节点显示用量
- **流式响应**: SSE 逐字渲染 + 闪烁光标，节点与面板同步
- **停止生成**: 保留已生成内容
- **失败原地重试**: Retry 按钮原地重试，错误走 toast 不污染回答
- **选中边高亮**: 祖先路径金色加粗，其余淡化
- **多选操作**: 框选节点：Merge Summary / Merge & Delete / Align / Export / Delete
- **节点角色系统**: 节点级 System Prompt 三模式（继承/向下设置/本节点重置），`appliedRole` 记录生成时角色，多父冲突 Radio 选择
- **角色模板库**: 审稿人 / 魔鬼代言人 / 统计顾问 / Code Reviewer / 导师
- **审稿人预设**: 批评角色骑在滑动红边上，每步新内容自动重新评审、历史成版本；审稿人是普通节点（可反问、可分支）
- **Agentic 检索**: AI SDK 工具循环：智谱网页搜索 + arXiv + Semantic Scholar（免费 API），`[n]` 引用 + References 持久化，强制总结兜底，工具分组开关
- **MCP 工具生态**: Claude Desktop 同格式 `mcp.config.json`；支持 stdio 与 HTTP/SSE；工具进入 agentic 循环并带调用进度；自带 mock server 供验证
- **数据持久化**: IndexedDB 自动保存（1s 防抖），刷新不丢
- **多画布项目管理**: 新建/切换/重命名/删除，每张独立保存
- **归档（剪而不弃）**: 画布淡化保留、从所有上下文排除、可恢复；多选批量
- **合并综合**: 框选节点 → 结构化整合（结论/依据/未决问题）
- **导出体系**: 整图 JSON 备份导入；上下文链/多选导出 Markdown
- **Context 发送预览**: 「~N tok · M messages · K files」实时预览，外加 材料 · 引用 · 对话 三层占比
- **附件系统**: 节点局部附件（拖拽/粘贴/上传）、继承 include/exclude 精确控制、指纹去重、图片 Vision 自动切换、PDF 文本+页图双通道
- **节点级模型覆盖**: 任意节点可固定自己的 LLM（卡片显示徽章，Regenerate 兄弟版本继承）；探索用便宜模型、关键推理用旗舰
- **Cmd+F 节点搜索**: 按问题/回答/摘要过滤，方向键 + Enter 定位画布
- **键盘快捷键**: Space 折叠、R 重生成、方向键沿 DAG 导航、Esc 逐级退出（教程内有速查表）
- **中英双语 UI**: 自动检测浏览器语言，一键切换
- **内置教程**: 十步图解 hero 页，从提问到范式
- **随处落提问节点**: 双击空白、点组件栏、或拖线落在空白处；新节点输入框自动聚焦
- **三层上下文组装**: 材料 → 引用块 → 链序对话，顺序与连线历史无关（同一张图，同一份 prompt）
- **内容节点**: 便签（markdown）/ 文件 / 带时间戳的链接快照；粘贴驱动创建；图片自动识读选用已配置的最强视觉模型
- **分区框**: 彩色标签区域 + 导航跳转列表；「隐藏注释」视图开关
- **陈旧追踪**: 每次生成记录上游指纹；节点琥珀徽章、上下文树圆点、下游 payload 中的显式 [Stale] 标注
- **批量重放**: 一键按依赖顺序重跑全部陈旧节点；确认框带 token 报价；随时可停
- **运行 manifest 导出**: `.manifest.json`：模型/角色/指纹/时间戳/陈旧标记/边类型/范式来源
- **范式模式**: human/prompt 步 + 材料槽；实例化 → 级联 → 解锁；改输入 + 重放 = 重跑实验；评审轮数写进文件的有界循环
- **首次打开自带示例画布**: 预置图（含 ⚖️ 上下文裁剪 A/B 对比演示）而非空白页；landing 可随时重新载入
- **导入 ChatGPT / Claude 记录**: conversations.json 拖进导入即可；ChatGPT 的编辑/重生成分支保留为图分叉，每个对话一张画布
- **环境变量配置**: key 走 `.env`，按 key 自动注册可用模型

</details>

## 成本与隐私

- **免费可用。** 智谱免费档（GLM-4.5-Flash 文本 + GLM-4V-Flash 视觉）覆盖全部功能；联网搜索约 ¥0.01/次。也可以接任何你已付费的模型，或本地 Ollama 完全离线。
- **数据在你手里。** 画布存在浏览器 IndexedDB；唯一的服务端是你自己机器上的轻代理。除了你选择的 LLM API，任何数据不上传任何地方。备份是你完全拥有的 JSON 文件。
- 可选：PDF 页图渲染需要 poppler（`brew install poppler`），缺失时自动降级纯文本。

## MCP 工具：接入整个生态

把 `mcp.config.example.json` 复制为 `mcp.config.json`，按 Claude Desktop 同款格式列出你的 [MCP](https://modelcontextprotocol.io) server，工具进入同一个 agentic 循环，模型自主决定何时调用。

```jsonc
{
  "mcpServers": {
    "zotero": { "command": "zotero-mcp", "env": { "ZOTERO_LOCAL": "true" } },  // 你的 Zotero 文献库
    "fetch":  { "command": "uvx", "args": ["mcp-server-fetch"] }               // 网页全文阅读
  }
}
```

仓库自带测试 server（`scripts/mock-mcp.mjs`）供验证全链路。

## 支持的模型

基于 Vercel AI SDK：**下表任何一家，把 key 填进 `.env` 即自动激活**，不改代码、不写配置。工具栏模型选择器随时切换；纯文本模型收到图片时自动改走视觉模型。各家默认模型 id 可用环境变量覆盖（如 `OPENAI_MODELS=gpt-5.2`），新模型发布无需升级代码。

> **图片理解需要视觉模型。** 粘贴的图片会自动提取一次（物体、文字、图表结构；科研图表输出坐标轴/面板/趋势），提取用你配置的**最强视觉模型**、结果作为图片的伴随文本永久缓存。免费的 `glm-4v-flash` 可用；旗舰视觉模型读科研图明显更好。

| 提供商 | 默认模型 | `.env` key | 说明 |
|--------|----------|------------|------|
| **智谱 GLM** | glm-4.5-flash · glm-4v-flash | `ZHIPU_API_KEY` | **免费**、国内直连；联网搜索由它驱动 |
| **通义千问** (DashScope) | qwen-plus · qwen-vl-plus | `DASHSCOPE_API_KEY` | 国内直连 |
| **OpenAI** | gpt-5.1 · gpt-5-mini | `OPENAI_API_KEY` | 可用 `OPENAI_MODELS` 覆盖 |
| **Anthropic** | claude-sonnet-5 · claude-haiku-4-5 | `ANTHROPIC_API_KEY` | 可用 `ANTHROPIC_MODELS` 覆盖 |
| **Google** | gemini-2.5-pro · gemini-2.5-flash | `GOOGLE_API_KEY` | 可用 `GOOGLE_MODELS` 覆盖 |
| **DeepSeek** | deepseek-chat · deepseek-reasoner | `DEEPSEEK_API_KEY` | 纯文本（有图自动改道视觉模型）|
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

## Roadmap

**近期**
- [ ] 事件日志导出（画布操作序列 → CSV/JSON，人机交互研究的测量层）
- [ ] 任意画布另存为范式（反向实例化）
- [ ] 附件 blob 分离（图片密集画布的规模化）

**长期**
- [ ] 运行对比视图（同一范式 N 次运行并排）
- [ ] Artifact 节点（画布上的文件产出，Monaco 编辑器 + 版本历史）
- [ ] 异步协作：分享范式、回收运行

## 反馈

ThoughtDAG 是一个活跃开发中的早期项目，正是反馈最有价值的时候：

- ⭐ 觉得这个思路有意思？**点个 Star**，这真的很有帮助
- 🐛 遇到 bug 或不顺手的地方？[提个 issue](https://github.com/chenxiachan/thoughtdag/issues)
- 💡 关于「用图思考」的想法？[来 Discussions 聊聊](https://github.com/chenxiachan/thoughtdag/discussions)

## 许可

[MIT](./LICENSE) © 2026 Xia Chen
