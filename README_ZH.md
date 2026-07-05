<div align="center">

<img src="public/favicon.svg" width="88" alt="ThoughtDAG logo"/>

# ThoughtDAG

### 让思考长成图，而不是一条线

**在无限画布上，把 AI 对话变成可编辑的思维图谱 —— 模型看到什么，由你决定。**

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-000000?logo=vercel&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072)
![Status](https://img.shields.io/badge/状态-活跃开发中-6B5CE7)

[English](./README.md) · [快速开始](#快速开始) · [核心特性](#核心特性) · [Roadmap](#roadmap)

<img src="docs/hero.png" alt="ThoughtDAG 画布：紫色主链、橙色探索分支、红色评审者监听边、带引用来源的回答" width="100%"/>

</div>

---

## 为什么需要 ThoughtDAG？

所有主流 LLM 界面都是**线性的、只能追加的、不透明的**：

- 对话越长，上下文被无关内容稀释得越厉害 —— 而你删不掉任何一句
- 想同时探索三个方向？开三个窗口，然后眼睁睁看着它们失去关联
- 「圈住这段话继续深挖」这个最自然的动作，只能靠复制粘贴模拟
- 最关键的：**你对 context window 里有什么，没有任何控制权**

ThoughtDAG 换了一个数据结构来回答这个问题：对话不是列表，是**图**。

## 一条规则，掌控上下文

- **节点** = 一轮问答 · **边** = 上下文的流向
- 发送给模型的上下文由一条规则决定：**沿所有入边递归向上遍历**
- 于是：**加一条边 = 注入上下文，删一条边 = 裁剪上下文**

```
[什么是ML?] ──紫──▶ [什么是DL?] ──紫──▶ [什么是Transformer?]
                        │
                    橙（选中文字分支）
                        ▼
              [具体解释一下 CNN]
```

- 「Transformer」节点看到节点 1 + 2；删掉 1→2、直连 1→3，它就只看到节点 1
- 分支节点带着选中的文字去探索，却不污染主链
- 提问前实时预览「将发送 ~N tok · M messages · K files」—— 上下文从黑箱变成仪表盘

## 核心特性

### 🧠 上下文，可见且可塑
每条边都是一次上下文决策：拖线合并分支、点选删除裁剪记忆、折叠节点自动改传摘要（上下文压缩）。发送预览让每次提问前都知道模型将看到什么。

### 🌿 随处分支，自由收敛
选中回答里的任意文字 → 向右生长出一条探索分支；跨分支拖线合并结论；Regenerate 生成兄弟版本对比择优；高亮关键段落做「蒸馏重生成」，去冗余保重点。

### 👁️ Evaluator 评审节点
给任意思路线挂一个对抗式「评审者」（红色监听边）：主线每产生新内容，审稿人 / 魔鬼代言人 / 统计顾问自动出批评，批评历史成版本可回溯。GAN 式的人机协作推理。

### 🔍 Agentic 联网搜索
模型自主判断何时需要搜索（常识不搜、时效必搜），回答带 `[n]` 行内引用，References 列表随节点持久化 —— 每个结论都有出处可点。工具栏地球开关一键离线。

### ✂️ 为深读设计的编辑
问答全部可编辑、回答多版本管理、LaTeX 公式、代码高亮、语义缩放（缩小画布自动切大字缩略卡）、一键排版按箭头顺序整理全图。

### 🗂️ 科研级工作流
多画布项目管理（一个课题一张图）、IndexedDB 自动保存、JSON 备份 / 导入、上下文链一键导出 Markdown、附件系统（图片 Vision / PDF 双通道 / 继承精确控制）、中英双语界面、内置五步教程。

<details>
<summary><b>📜 完整功能清单（50+ 项）</b></summary>

- **无限画布** — 平移、缩放、自由拖拽节点（React Flow）
- **DAG 上下文引擎** — `buildContext()` 遍历所有入边，拓扑序构建对话历史
- **紫色边**（继续追问）— 继承完整祖先上下文
- **橙色边**（分支探索）— 选中文字 → 向右分支，探索性提问
- **跨分支连线** — 拖拽连接任意节点，合并上下文
- **连线点选删除** — 点击连线选中，浮出删除按钮；右键菜单同样可删；Cmd+Z 撤销
- **重新生成** — 创建兄弟节点（树形分支，不是原地替换）
- **全部可编辑** — 双击编辑问题或回答
- **文字选择工具栏** — 选中回答中的文字 → 分支 / 高亮
- **Markdown + LaTeX 渲染** — 完整 markdown、代码高亮、行内与块级公式
- **版本管理** — 在回答版本间导航，删除差的版本
- **Focus 侧栏面板** — 完整问答编辑、版本导航、高亮管理、context chain 可视化、追问输入；宽度可拖拽
- **高亮系统** — 三种下游传递模式：📄 全文 / 🏷️ 标记重点 / ✂️ 仅传高亮
- **精炼重生成（Distill）** — 高亮关键段落后一键创建精炼兄弟节点
- **编辑自动清理失效高亮**
- **撤销/重做** — Cmd+Z / Cmd+Shift+Z，完整状态快照
- **Column-Tree 自动布局** — 主链向下、分支向右分列，真实测量高度防重叠
- **一键排版 / 圈选对齐** — 按箭头顺序整理全图（确认框防误触）；多选 Align 堆叠成列
- **折叠/展开** — 折叠节点传摘要不传全文（上下文压缩），下游自动平移
- **节点自动摘要** — 后台 LLM 生成，折叠态显示
- **语义缩放** — 缩小画布节点切大字缩略卡
- **Token 计数** — 每节点显示用量
- **流式响应** — SSE 逐字渲染 + 闪烁光标，节点与面板同步
- **停止生成** — 保留已生成内容
- **失败原地重试** — Retry 按钮原地重试，错误走 toast 不污染回答
- **选中边高亮** — 祖先路径金色加粗，其余淡化
- **多选操作** — 框选节点：Merge Summary / Merge & Delete / Align / Export / Delete
- **节点角色系统** — 节点级 System Prompt 三模式（继承/向下设置/本节点重置），`appliedRole` 记录生成时角色，多父冲突 Radio 选择
- **角色模板库** — 审稿人 / 魔鬼代言人 / 统计顾问 / Code Reviewer / 导师
- **Evaluator 评审节点** — 红色监听边订阅主线，自动/手动评判，批评历史版本化
- **Agentic 联网搜索** — AI SDK 工具循环 + 智谱搜索 API，`[n]` 引用 + References 持久化，强制总结兜底
- **数据持久化** — IndexedDB 自动保存（1s 防抖），刷新不丢
- **多画布项目管理** — 新建/切换/重命名/删除，每张独立保存
- **导出体系** — 整图 JSON 备份导入；上下文链/多选导出 Markdown
- **Context 发送预览** — 「~N tok · M messages · K files」实时预览
- **附件系统** — 节点局部附件（拖拽/粘贴/上传）、继承 include/exclude 精确控制、指纹去重、图片 Vision 自动切换、PDF 文本+页图双通道
- **中英双语 UI** — 自动检测浏览器语言，一键切换
- **内置教程** — 五步图解快速上手
- **画布新建 Root** — 双击空白处提问，多棵树共存
- **环境变量配置** — key 走 `.env`，按 key 自动注册可用模型

</details>

## 快速开始

```bash
npm install
cp .env.example .env   # 至少填一把 key：ZHIPU_API_KEY（免费）或 DASHSCOPE_API_KEY
npm run server         # 启动 LLM 代理（缺 key 会友好报错）
npm run dev            # 另开终端，启动开发服务器
# 打开 http://localhost:5173
```

> **免费用法：** 到 [open.bigmodel.cn](https://open.bigmodel.cn/) 注册智谱账号（手机号即可），生成 API key 填入 `ZHIPU_API_KEY`。GLM-4.5-Flash（文本）与 GLM-4V-Flash（视觉）免费，联网搜索约 ¥0.01/次。
>
> **可选依赖：** PDF 页图渲染需要 poppler（`brew install poppler`），缺失时自动降级纯文本。
>
> **数据存储：** 画布保存在浏览器 IndexedDB；清空存档：DevTools Console 执行 `indexedDB.deleteDatabase('keyval-store')` 后刷新。

## 技术栈与架构

| 层级 | 技术 |
|------|------|
| 界面 | React 19 + TypeScript + Vite 7 |
| 画布 | @xyflow/react (React Flow) |
| 状态 | Zustand（persist → IndexedDB via idb-keyval）|
| 样式 | Tailwind CSS v4 |
| 大模型 | Vercel AI SDK 多后端：智谱 GLM（免费）、通义千问，按 .env key 自动注册；Anthropic/OpenAI/DeepSeek/Ollama 一行接入 |
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
- [ ] 节点级多模型切换 — 每个节点选不同 LLM，探索用 Flash、关键推理用旗舰
- [ ] MCP 工具生态接入 — arXiv 检索、网页全文阅读等科研工具
- [ ] 键盘快捷键 + Cmd+F 节点搜索
- [ ] 边交叉最小化、Hover ＋ 空白子节点、框选 Group/Ungroup

**远期**
- [ ] 多 Evaluator 协作（审稿人 + 统计顾问 + 语言编辑同挂一条主线）
- [ ] Artifact 节点（画布上的文件产出物，Monaco 编辑器 + 版本历史）
- [ ] 导入 ChatGPT/Claude 历史对话自动转 DAG
- [ ] 协作模式、模板系统、本地 LLM（Ollama）、DOCX 解析

## 许可

Private，暂未开源。
