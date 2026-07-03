# ThoughtDAG

**在无限画布上，把 AI 对话变成可编辑的思维 DAG。**

[English](./README_EN.md)

ThoughtDAG 把 LLM 对话从线性聊天变成空间化、可编辑的 DAG（有向无环图）。像 Figma 遇上 ChatGPT — 你可以分支、裁剪、合并，精确控制 AI 看到的上下文。

![Status](https://img.shields.io/badge/状态-原型-orange) ![License](https://img.shields.io/badge/许可-私有-lightgrey)

## 问题

现有的 LLM 对话界面是**线性的、只能追加的、不透明的**：

- 对话越长，上下文越被无关内容稀释
- 想探索多个方向？只能开多个聊天窗口，丢失关联
- 无法从 AI 的记忆中删掉一个糟糕的回答或无关的岔路
- 没法"圈一段话继续深挖"，只能复制粘贴
- **用户对 context window 没有任何控制权**

## 核心思路

如果对话是画布上的**图**而不是滚动列表呢？

- **节点** = 一轮问答（用户提问 + AI 回答）
- **边** = 上下文流（箭头表示 AI 能"看到"什么）
- **加一条边** = 注入上下文。**删一条边** = 裁剪上下文。
- 从任意文字选中处**分支**，探索岔路
- 通过连线**合并**不同分支

发送给 LLM 的上下文由一条简单规则决定：**沿所有入边递归向上遍历（DAG 遍历）**。你控制图，就控制了上下文。

## 演示

```
[什么是ML?] ──蓝色──▶ [什么是DL?] ──蓝色──▶ [什么是Transformer?]
                            │
                       橙色（分支）
                            │
                            ▼
                  [具体解释一下CNN]
```

- 节点3（"Transformer"）的上下文包含节点 1 + 2
- 删掉 1→2 的边，直接连 1→3 → 节点3只看到节点1
- 分支节点（"CNN"）看到 1 + 2 + 选中文字，但不会污染主链

## 功能状态

### ✅ 已实现

- **无限画布** — 平移、缩放、自由拖拽节点（React Flow）
- **LLM 集成** — 通义千问 Qwen Plus（DashScope 国际版 API，模型可替换）
- **DAG 上下文引擎** — `buildContext()` 遍历所有入边，拓扑序构建对话历史
- **蓝色边**（继续追问）— 继承完整祖先上下文
- **橙色边**（分支探索）— 选中文字 → 向右分支，探索性提问
- **跨分支连线** — 拖拽连接任意节点，合并上下文
- **右键删除边** — 右键点击边 → 删除，立即裁剪上下文
- **重新生成** — 创建兄弟节点（树形分支，不是原地替换）
- **全部可编辑** — 双击编辑问题或回答
- **文字选择工具栏** — 选中回答中的文字 → 分支 / 高亮
- **Markdown 渲染** — 完整 markdown + 代码高亮
- **版本管理** — 在回答版本间导航，删除差的版本
- **Focus 侧栏面板** — 点选节点弹出 480px 侧栏：完整问答编辑、版本导航、高亮管理、context chain（DAG 遍历 + 点击定位）、追问输入
- **高亮系统** — 选中文字 ⭐ 高亮，三种下游传递模式：📄 全文 / 🏷️ 标记重点 / ✂️ 仅传高亮
- **精炼重生成（Distill）** — 高亮关键段落后一键让 LLM 保留高亮去冗余，创建精炼兄弟节点
- **编辑自动清理高亮** — 修改回答后，失效的高亮自动移除
- **节点选中高亮** — 选中节点显示紫色高亮环，context chain 点击定位画布
- **撤销/重做** — Cmd+Z / Cmd+Shift+Z，完整状态快照 + 画布 Undo/Redo 按钮
- **自动布局** — 蓝色边向下、橙色边向右，动态高度防重叠
- **折叠/展开** — 收起节点节省空间
- **Token 计数** — 每个节点显示 token 用量
- **流式响应** — SSE streaming，FocusPanel 实时逐字渲染 + 闪烁光标
- **LaTeX 渲染** — 支持行内 `$...$` 和块级 `$$...$$` 数学公式
- **节点复制** — Duplicate 按钮，保留问答和高亮，连到同一父节点
- **Explore 高亮** — 对高亮内容输入追问，高亮作为上下文创建探索分支
- **Summary 高亮** — 对高亮内容一键总结，创建总结分支节点
- **Column-Tree 布局** — 主链向下、分支向右分列；regenerate 兄弟紧贴主轴同行排列
- **碰撞检测** — 同列节点自动推挤避免重叠，级联后代节点
- **节点自动摘要** — 后台 LLM 生成摘要，折叠态显示，折叠节点传摘要不传全文（context 压缩）
- **展开/折叠动态布局** — 折叠节点紧凑，展开后下游自动平移，不重置手动拖拽位置
- **选中呼吸灯** — 选中节点紫色脉冲光晕
- **多选操作** — 左键拖画布框选多节点，顶部工具栏：Merge Summary / Merge & Delete / Summary Highlights / Explore / Delete All
- **停止生成** — 生成过程中 Actions 显示 Stop 按钮，停止后保留已生成内容
- **选中边高亮** — 选中节点时祖先路径上的边变金色加粗（#F59E0B），其余边淡化
- **节点角色系统** — 每个节点可设 System Prompt（Role），三种模式：Inherit from previous / Set for next ↓ / Reset for this node；子节点自动继承，可覆盖。`appliedRole` 记录生成时使用的角色（编辑不影响 badge）
- **多 Role 冲突解决** — DAG 多父节点场景下，如果多条入边带有不同 Role，FocusPanel 显示 Radio 选择器（Primary / Cross-link 标签），默认主边优先，用户可手动切换
- **数据持久化** — 画布自动保存到 IndexedDB（防抖 1s），刷新不丢数据；恢复的图作为 undo 栈基底
- **环境变量配置** — API key 走 `.env`（不入库），代理端口与前端 API 地址均可配置

### 📎 附件系统（Phase 1 已实现）

**核心差异化**：与线性聊天不同，ThoughtDAG 允许在下游节点中精确控制附件的继承。

- ✅ **节点局部附件** — 文件绑定在具体节点上，不是全局对话历史；拖拽/粘贴/点击上传
- ✅ **继承附件控制** — FocusPanel 显示上游所有附件，每个附件可 toggle include/exclude（`excludedAttachmentIds` / `includedAttachmentIds` 覆盖机制）
- ✅ **用户完全透明** — 提问前就能看到"这个节点的 LLM 会看到哪些文件"
- ✅ **附件只传一次** — 附件在原始节点的消息位置出现，下游节点通过 DAG 遍历自然继承；指纹去重保证多路径合并时只出现一次
- ✅ **图片 + Vision** — 有图自动切换 Qwen-VL
- ✅ **文本文件** — txt/md/code 直接注入 context
- ✅ **PDF** — 服务端 pdfjs 抽文本 + poppler 渲染页图；>10 页默认 Text-only（可切换 Vision）；无 poppler 时自动降级纯文本
- **Phase 2（待做）**: DOCX + Web Search
- **Phase 3（待做）**: LLM Tool Use（自主搜索）

### 📋 Roadmap

#### P0 — 基础体验
- [x] **数据持久化** — ✅ 自动保存到 IndexedDB，刷新不丢数据（undo 历史与选中态不持久化）
- [ ] **多项目切换** — 项目列表管理（新建/切换/重命名/删除），每个项目独立保存
- [x] **流式响应** — LLM 回答逐字输出（SSE streaming），FocusPanel 实时渲染 + 闪烁光标

#### P1 — 节点深度编辑
- [x] **侧栏 Focus 面板** — 480px 侧栏，完整问答编辑、版本管理、高亮管理、context chain DAG 遍历可视化 + 点击定位
- [x] **高亮→精炼重生成（Distill）** — 高亮关键段落 → 一键创建精炼兄弟节点
- [x] **高亮上下文传递** — 三模式：Full text / Tag important / Highlights only，节点级设置
- [x] **编辑自动清理失效高亮**
- [x] **节点自动摘要** — ✅ 已实现

#### P2 — 效率提升
- [ ] **i18n 语言切换** — 中/英切换，UI 文案 + LLM prompt 抽取为语言包
- [x] **节点碰撞检测** — Column-Tree 布局 + 碰撞推挤
- [x] **多选操作** — 左键拖框选，Merge Summary / Merge & Delete / Explore / Delete All
- [x] **停止生成** — 生成中显示 Stop 按钮，保留已生成内容
- [x] **选中边高亮** — 祖先路径金色加粗，其余淡化
- [ ] **边交叉最小化** — 优化跨列连线路径，减少视觉交叉
- [ ] **节点底部 Hover ＋ 按钮** — 悬浮节点下方出现加号按钮，点击创建空白子节点（无问题、无回答），可用于预连接上下文、设置 Role、手动拖线
- [ ] **框选 Group/Ungroup** — 框选多节点 → 右键菜单 Group 打包为可折叠组（视觉分组 + 折叠为摘要），Ungroup 解散
- [ ] **键盘快捷键** — Tab=追问, Space=折叠/展开, Esc=逐级退出, Delete=删除, R=重新生成, Cmd+D=复制, Cmd+E=编辑问题, ↑↓←→=DAG 导航（父子/兄弟）
- [ ] **搜索节点** — Cmd+F 打开搜索框，匹配节点内容并定位画布居中
- [ ] **画布新建 Root** — 双击画布空白处创建新 root 节点（独立 DAG 起点）；多棵 DAG 树共存于同一画布，之后可通过拖线 cross-link 合并到其他节点的上下文中

#### P2.5 — 节点角色系统
- [x] **节点级 System Prompt** — 三种模式：Inherit from previous / Set for next ↓ / Reset for this node
- [x] **`appliedRole`** — 生成时记录使用的角色，节点 badge 显示，编辑不影响
- [x] **Landing page / New root 可设 optional role**
- [x] **Inherit role checkbox** — Continue / Branch / Highlight Explore 输入框下方
- [x] **多 Role 冲突解决** — DAG 多父节点 role 不同时，FocusPanel Radio 选择器，默认主边优先
- [ ] **角色模板** — 预设角色库（论文审稿人、Python 专家、魔鬼代言人、教师等），一键应用到节点

#### P3 — 差异化功能
- [ ] **Evaluator 节点（对抗式推理）⭐** — GAN 式对抗结构，ThoughtDAG 核心差异化特性：
  - 🔴 **监听边（红色）**：新的边类型，Evaluator 节点"订阅"主线，主线每产生新内容自动触发评判
  - **角色驱动**：使用节点级 rolePrompt（审稿人、debug 专家、魔鬼代言人等）
  - **上下文语义**：Evaluator 的 context = 自身历史 + 监听的主线内容
  - **人为干预**：每轮评判后可编辑、跳过、修改角色、调整触发频率
  - **应用场景**：论文+审稿人、代码+reviewer、辩论正反方、翻译+质检、教学+导师
  - **预设模板**：一键开启"辩论模式""审稿模式""Code Review 模式"
- [ ] **节点级多模型切换** — 每个节点可选择不同 LLM（Claude/GPT/Qwen/DeepSeek），发挥不同模型在不同任务的优势
- [ ] **节点簇合并摘要** — 框选多节点 → 总结为摘要节点，原始折叠
- [ ] **导出为文件** — 多选节点 → LLM 整理为代码文件/文档/论文大纲 → 下载。轻量的产出物方案
- [ ] **代码块增强** — 代码块加 Copy/Run 按钮，Open in Editor 弹出可编辑面板

#### P0.5 — 附件系统 Phase 1 ✅ 已完成
- [x] **图片上传 + Vision** — Qwen-VL-Plus 理解图片内容
- [x] **文本文件上传** — txt/md/code 直接注入 context
- [x] **PDF 上传** — 服务端抽文本 + 渲染页图，>10 页默认 Text-only
- [x] **FocusPanel 附件区** — 上传 + 继承附件列表 + include/exclude toggle
- [x] **buildContext 附件过滤** — `excludedAttachmentIds` 控制哪些上游附件被排除

#### P4 — 长期愿景
- [ ] **附件系统 Phase 2/3** — PDF/DOCX 解析、Web Search、LLM Tool Use
- [ ] **协作模式** — 多人实时编辑同一个 DAG，支持光标同步和冲突解决
- [ ] **导入历史对话** — 从 ChatGPT/Claude 导出的 JSON 自动转为 DAG 结构
- [ ] **模板系统** — 预设 DAG 结构（论文研究、代码审查等），与 Evaluator 模板整合
- [ ] **本地 LLM** — 接入 Ollama，完全离线使用
- [ ] **多 Evaluator 协作** — 同一主线挂载多个不同角色的 Evaluator（审稿人 + 统计顾问 + 语言编辑）
- [ ] **Artifact 节点** — 画布上的特殊文件节点，🟢绿色贡献边连接源节点，手动 Sync 触发 LLM 合并，内置 Monaco 编辑器，版本历史
- [ ] **本地文件映射** — Artifact 节点映射到本地文件（Save/Load/Watch），按需实现
- [ ] **Context 面板增强** — 手动勾选/排除祖先、token 预算条、点击定位

## 技术栈

| 层级 | 技术 |
|------|------|
| 界面 | React 19 + TypeScript + Vite 7 |
| 画布 | @xyflow/react (React Flow) |
| 状态 | Zustand（persist → IndexedDB via idb-keyval）|
| 样式 | Tailwind CSS v4 |
| 大模型 | 通义千问 Qwen Plus / Qwen-VL（DashScope intl API，经 @mariozechner/pi-ai）|
| 代理 | Express (server.mjs, 默认端口 3001) |

## 快速开始

```bash
npm install
cp .env.example .env   # 填入你的 DASHSCOPE_API_KEY
npm run server         # 启动 LLM 代理（缺 key 会友好报错）
npm run dev            # 另开终端，启动开发服务器
# 打开 http://localhost:5173
```

> **可选依赖：** PDF 页图渲染需要 poppler（`brew install poppler`）。没有它 PDF 附件自动降级为纯文本模式。
>
> **数据存储：** 画布自动保存在浏览器 IndexedDB。如需清空存档，在 DevTools Console 执行 `indexedDB.deleteDatabase('keyval-store')` 后刷新。

## 架构

```
浏览器 (localhost:5173)
  └─ React + React Flow 画布
      └─ Zustand store (nodes, edges, history) ⇄ IndexedDB（自动保存）
          ├─ buildContext(nodeId) → 遍历 DAG → ContextMessage[] + images
          └─ src/lib/api.ts
              ├─ llmCallStream(messages) → POST /api/stream（SSE 流式）
              ├─ llmCall(messages)       → POST /api/claude（非流式，用于摘要）
              └─ extractPdf(base64)      → POST /api/pdf-extract
                        └─ Express 代理 (server.mjs) → DashScope API（Qwen Plus / 有图切 Qwen-VL）
```

## 许可

Private，暂未开源。

---

*Xia & Claw 🐾 共同构建*
