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

<img src="docs/hero.png" alt="ThoughtDAG 画布：PDF 材料节点穿着首页封面，从阅读长出的问题连在下方，追问链向下、橙色探索分支向右" width="100%"/>

</div>

## 为什么

聊天是线性而不透明的：对话越长上下文越稀释，说过的话删不掉，你也永远不知道模型到底读了什么。ThoughtDAG 把对话铺成一张图：问题是节点，连线是上下文，编辑图，就是在编辑模型的记忆。让思考长成图，而不是一条线。

## 快速开始

```bash
npm install
cp .env.example .env   # 一把 key 就够：ZHIPU_API_KEY 免费（open.bigmodel.cn）
npm run server         # LLM 代理
npm run dev            # → http://localhost:5173
```

首次打开是预置的示例画布，不用输入任何东西就能上手。最快的入口：把一篇 PDF 拖到首页，从阅读开始。

## 唯一法则：连线即上下文

模型只看到连进节点的内容。加边即注入，删边即裁剪，每次提问前都有实时 token 预览报出要发送的载荷。

<img src="docs/context-compare.png" alt="同一个问题、两种上下文：带噪音边的回答混进了晚饭计划；删掉后总结保持纯技术" width="100%"/>

*同一个问题问两次。左：一个无关节点连了进来，噪音直接漏进回答。右：删掉那条边，回答保持干净。*

## 把文献读成思维地图

拖入 PDF，读的是原版页面。圈选一段、直接提问：答案在文档旁边流式出现，问题作为节点带着页码落在画布上、连着材料。就地追问、给关键句加高亮、接着往下读。抬起头时，精读的地图已经画好了。扫描件一键重排为可读的 Markdown，公式也认。

<img src="docs/reader.png" alt="材料阅读器：左侧是带文字层的原版 PDF，右侧批注栏流式显示回答，底部长出问题 chips" width="100%"/>

## 核心手势

<img src="docs/demo.gif" alt="选中回答中的文字，点 Explore，橙色分支节点带着选中内容作为上下文流式生成" width="100%"/>

*选中任何回答里的任何一段文字，点 Explore，分支就从这段文字里长出来。主链保持干净。*

## 功能总览

| | |
|---|---|
| 🧠 上下文编辑 | 拖线合并分支、删线裁剪记忆、归档的节点退出一切未来上下文 |
| 🔗 引用 | 虚线只引一个节点的问答，不拖整条对话；引用⇄全量随时切换，价格全程可见 |
| 🧹 收敛 | 框选冗余节点，合并成一个结构化综合，原件归档 |
| 🗺️ 地图视图 | 缩小画布，每张卡显示一行收获句，整张图读起来像实验室笔记的目录 |
| 🧭 陈旧与重放 | 上游一改，被影响的回答立刻亮标记；按依赖顺序批量重放，先报 token 价 |
| 🩺 拓扑体检 | 一键揪出结构病（重复通路、盲评破盲），每条发现带定位和一键修复 |
| 🧪 范式 | 可复用的人机工作流；改个输入、一键重放，整个实验重跑一遍 |
| 👁️ 随动评审 | 批评者沿着思路自动前移，每一步新内容都被重新评审，历史成版本 |
| 🔍 Agentic 检索 | 网页、arXiv、Semantic Scholar，行内引用；何时检索由模型自己判断 |
| 🔌 模型自由 | 九家 provider 填 key 即用，节点级切换模型，Ollama 完全本地离线 |
| 🎭 角色 | 节点级 system prompt 沿链继承，角色库可自行增删改 |
| 🔒 本地优先 | 浏览器 + 你自己机器上的轻代理；备份是你完全拥有的 JSON 文件 |

<img src="docs/converge.gif" alt="框选三个冗余节点，合并成综合节点，归档原件" width="100%"/>

*收敛实拍：三个冗余节点合并成一个综合，原件仍在画布上，但退出一切上下文。*

<details>
<summary><b>📜 完整功能清单（60+ 项）</b></summary>

- **材料阅读器**: 原版 PDF 渲染+可选中文字层（pdf.js）；圈选→提问=支线节点带 `(p.N)` 出处；扫描件回退提取文本视图；逐页视觉**识别**为 Markdown/LaTeX（可编辑，MinerU 贴入点）；整份材料提问常驻输入；每份材料记住滚动位置
- **批注栏**: 答案在文档旁流式出现；追问接成链；在答案里圈选可探索（挂在该回答下）或加高亮；chips 切换线程，十字跳画布
- **材料优先首页**: 文档拖到首页=材料节点+阅读器自动打开；给根问题带附件走显式回形针
- **地图模式**: 缩放低于 ~0.8 时卡片渲染为收获句标签牌（pill 圆角+类型色描边）；滞回防抖动；等人输入的节点和运行中的范式保持工作形态
- **收获句跟版本**: 每个回答版本各有一行结论先行的总结（纯显示层，永不进上下文与指纹；短回答直接全文、不花调用）
- **拓扑体检**: 按需诊断，确定性发现（残差实线/影子引用/盲评破盲/候选不对称）+ 观察项（巨链/开放支线/坍缩点）；定位跳转+一键修复
- **无限画布**: 平移、缩放、自由拖拽节点（React Flow）
- **DAG 上下文引擎**: `buildContext()` 遍历所有入边，拓扑序构建对话历史
- **紫色边**（继续追问）：继承完整祖先上下文
- **橙色实线**（分支探索）：选中文字 → 向右分支，探索性提问；实线永远=结构，虚线永远=旁路（引用 / 评审）
- **引用边（虚线）**: 手拖连线落在任意节点=引用它（问答+上游来路），不拖整条对话；深度是边的一等属性：选中边或在面板上下文树里都能切 引用⇄全量，连线 toast 同时报出两档价格（源头无上游链时不打扰）
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
- **折叠/展开**: 纯视觉收纳，链上永远流动全文（省 token 用归档 / 高亮过滤 / 引用档位）
- **每节点收获句**: 后台自动生成一行结论先行的总结，与当前回答版本对齐；缩小画布与折叠时它就是卡片的脸
- **带滞回的语义缩放**: 0.8 以下地图标签、0.9 以上工作卡片；在接近 1:1 才展开，同时展开的卡片天然只有几张
- **Token 计数**: 每节点显示用量
- **流式响应**: SSE 逐字渲染 + 闪烁光标，节点与面板同步
- **停止生成**: 保留已生成内容
- **失败原地重试**: Retry 按钮原地重试，错误走 toast 不污染回答
- **选中边高亮**: 祖先路径金色加粗，其余淡化
- **多选操作**: 框选节点：Merge Summary / Merge & Delete / Align / Export / Delete
- **节点角色系统**: 节点级 System Prompt 三模式（继承/向下设置/本节点重置），`appliedRole` 记录生成时角色，多父冲突 Radio 选择
- **角色库（可编辑）**: 内置角色（审稿人 / 质疑者 / 统计顾问 / Code Reviewer / 导师）+ 你自己的角色；管理器中可增删改（改内置=生成你的副本，可一键恢复）；已应用到节点的角色保持冻结
- **审稿人预设**: 批评角色骑在滑动红边上，每步新内容自动重新评审、历史成版本；审稿人是普通节点（可反问、可分支）
- **Agentic 检索**: AI SDK 工具循环：智谱网页搜索 + arXiv + Semantic Scholar（免费 API），`[n]` 引用 + References 持久化，强制总结兜底，工具分组开关
- **MCP 工具生态**: Claude Desktop 同格式 `mcp.config.json`；支持 stdio 与 HTTP/SSE；工具进入 agentic 循环并带调用进度；自带 mock server 供验证
- **数据持久化**: IndexedDB 自动保存（1s 防抖），刷新不丢
- **多画布项目管理**: 新建/切换/重命名/删除，每张独立保存
- **归档（剪而不弃）**: 画布淡化保留、从所有上下文排除、可恢复；多选批量
- **合并综合**: 框选节点 → 结构化整合（结论/依据/未决问题）
- **导出体系**: 整图 JSON 备份（工具栏一键导出，携带范式出处）与导入；上下文链/多选导出 Markdown
- **Context 发送预览**: 「~N tok · M messages · K files」实时预览，外加 材料 · 引用 · 对话 三层占比
- **附件系统**: 节点局部附件（拖拽/粘贴/上传）、继承 include/exclude 精确控制、指纹去重、图片 Vision 自动切换；PDF 以提取文本进入上下文（扫描件用阅读器的识别升级），文件节点上以首页作封面
- **节点级模型覆盖**: 任意节点可固定自己的 LLM（卡片显示徽章，Regenerate 兄弟版本继承）；探索用便宜模型、关键推理用旗舰
- **Cmd+F 节点搜索**: 按问题/回答/摘要过滤，方向键 + Enter 定位画布
- **键盘快捷键**: Space 折叠、R 重生成、方向键沿 DAG 导航、Esc 逐级退出（教程内有速查表）
- **中英双语 UI**: 自动检测浏览器语言，一键切换
- **内置教程**: 十步图解 hero 页，从提问到范式
- **随处落提问节点**: 双击空白、点组件栏、或拖线落在空白处；新节点输入框自动聚焦
- **三层上下文组装**: 材料 → 引用块 → 链序对话，顺序与连线历史无关（同一张图，同一份 prompt）
- **内容节点**: 便签（markdown）/ 带 PDF 封面的文件节点 / 带时间戳的链接快照；粘贴驱动创建；图片自动识读选用已配置的最强视觉模型；所有材料都能在阅读器里打开
- **分区框**: 彩色标签区域 + 导航跳转列表；「隐藏注释」视图开关
- **陈旧追踪**: 每次生成记录上游指纹；节点琥珀徽章、上下文树圆点、下游 payload 中的显式 [Stale] 标注
- **批量重放**: 一键按依赖顺序重跑全部陈旧节点；确认框带 token 报价；随时可停
- **范式模式**: human/prompt 步 + 材料槽；实例化 → 级联 → 解锁；改输入 + 重放 = 重跑实验；评审轮数写进文件的有界循环
- **首次打开自带示例画布**: 预置图（含 ⚖️ 上下文裁剪 A/B 对比演示）而非空白页；landing 可随时重新载入
- **导入 ChatGPT / Claude 记录**: conversations.json 拖进导入即可；ChatGPT 的编辑/重生成分支保留为图分叉，每个对话一张画布
- **环境变量配置**: key 走 `.env`，按 key 自动注册可用模型

</details>

## 设计哲学

聊天终端是执行的 harness：为「把答案递给你」而优化，其余一切都被隐藏。ThoughtDAG 是认知的 instrument：价值单位是推理结构本身，保持可读、可编辑、可复现。

行业把对齐做在模型权重里，工作台把自己的那份对齐做在结构里：你看得见模型读了什么，每个回答都留着出处，过期的结论会自己报告，任何一次运行都可以重放。这是计算机更老的那条谱系，从 memex 到 Engelbart：不是替你思考的机器，而是让你想得更远的仪器。

*图无环，环是人。*

## 成本与隐私

- **免费可用。** 智谱免费档（GLM-4.5-Flash 文本 + GLM-4V-Flash 视觉）覆盖全部功能；联网搜索约 ¥0.01/次。也可以接任何你已付费的模型，或本地 Ollama 完全离线。
- **数据在你手里。** 画布存在浏览器 IndexedDB；唯一的服务端是你自己机器上的轻代理。除了你选择的 LLM API，任何数据不上传任何地方。备份是你完全拥有的 JSON 文件。
- 可选：PDF 页图渲染需要 poppler（`brew install poppler`），缺失时自动降级纯文本。

## 支持的模型

基于 Vercel AI SDK。下表任何一家，把 key 填进 `.env` 即自动激活；工具栏随时换模型，纯文本模型遇到图片自动改道视觉模型。各家默认模型 id 可用环境变量覆盖（如 `OPENAI_MODELS=gpt-5.2`）。

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
