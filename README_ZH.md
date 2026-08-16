<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**思考值得一张地图。** 在无限画布上，AI 对话长成一张可编辑的思维图。

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/许可-MIT-green)
![Status](https://img.shields.io/badge/状态-活跃开发中-6B5CE7)

### [下载桌面版 ↓](https://chenxiachan.github.io/thoughtdag/?lang=zh#download) · [官网](https://chenxiachan.github.io/thoughtdag/?lang=zh)

[English](./README.md) · [快速开始](#快速开始) · [桌面版](#桌面版) · [有何不同](#thoughtdag-有何不同) · [模型与订阅](#模型与订阅) · [成本与隐私](#成本与隐私)

<img src="docs/hero-demo-zh.gif" alt="真实录屏的 Hero 演示：在 PDF 阅读器圈选段落提问；删掉噪音边重新生成干净答案；三层语义缩放缩到地图形态；打开备份控制中心导出真实文件" width="100%"/>

</div>

**▶ 33 秒旁白讲解，页面内直接播放：**

https://github.com/user-attachments/assets/f0362497-0e80-4caa-8214-cdbac92ab77c

## 唯一法则

> **连线即上下文。** 模型看到的，精确等于连进节点的内容。编辑图，就是在编辑模型的记忆。

## 它长什么样

每个手势背后是同一条原则：**人在回路上，模型在连线上**。没有自主代理替你改图。

<table>
<tr>
<td width="45%"><img src="docs/illus/prune-zh.svg" alt="示意图：研究主链与总结节点由实线相连，通往晚饭节点的边被剪断成红色虚线"/></td>
<td width="55%">

### ✂️ 删一条边，换一个答案

模型只看到连进来的内容。删掉噪音边，同一个问题返回干净的回答。**在示例画布第 ③ 区亲手复现。**

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### 📖 把文献读成思维地图

圈选一段直接提问，答案带着页码落进画布，p.N 芯片一键跳回原文。**读完论文，地图已经画好。**

</td>
<td width="45%"><img src="docs/illus/reading-zh.svg" alt="示意图：在原文页面圈选一段文字，旁边浮出紫色提问气泡，段落带 p.3 出处"/></td>
</tr>
</table>

<table>
<tr>
<td width="45%"><img src="docs/illus/condense-zh.svg" alt="示意图：三张带高光的小卡由连线汇聚成一张综合卡，下方一条带认知徽章的小时间轴"/></td>
<td width="55%">

### 💎 思考在你手里不断凝练

节点合并成更高的结论，高光串成总结。图不断收拢，而不是不断膨胀。**人在回路中提炼。**

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### 🖍️ 你标的重点，串成带引用的文字

高光是你的判断，不是模型的。勾选几条，串成每句可溯源的一段话。

</td>
<td width="45%"><img src="docs/illus/weave-zh.svg" alt="示意图：高光卡片里的一句话被串联进下方带引用编号的成文段落"/></td>
</tr>
</table>

<table>
<tr>
<td width="45%"><img src="docs/illus/map-zh.svg" alt="示意图：三个收获句门牌，分别带排除、决策、转向徽章，虚线相连"/></td>
<td width="55%">

### 🗺️ 缩小画布，思考自成地图

完整卡片、收获句门牌、图标骨架三层缩放，每步带认知徽章 ✕ ⚖ ↩ ?。**走过的弯路也是地图的一部分。**

</td>
</tr>
</table>

## 快速开始

首选[桌面版](#桌面版)：下载、打开、开始思考。从源码运行也可以：

```bash
npm install
npm run server    # LLM 代理 :3001
npm run dev       # → localhost:5173
# 无 .env 时，在应用内连接任意兼容 OpenAI 协议的接口即可
```

想先花十秒看看再决定装不装？[在线 Demo](https://app.thoughtdag.workers.dev) 在浏览器里直接跑，示例画布免 key。注意它是功能子集：免 key 联网搜索、部分直连工具和订阅桥只在桌面版/本地可用。

首页一键载入预置的示例画布：围绕「收藏夹为什么总在吃灰」展开四章，含一份内嵌真 PDF 的阅读闭环。环境变量、免费 key 与配置细节 → [docs/setup_ZH.md](docs/setup_ZH.md)

## 桌面版

同一个应用装进独立窗口，内置本地引擎。不需要 Node，不需要终端。最省事的入口是[下载页](https://chenxiachan.github.io/thoughtdag/?lang=zh#download)，页面会自动识别你的平台并直接给出安装包。

直接从 [Releases](https://github.com/chenxiachan/thoughtdag/releases/latest) 下载的话，按系统对照选择：

| 你的系统 | 下载这个文件 |
|---------|-------------|
| macOS，Apple Silicon（M1 及之后） | `ThoughtDAG-x.y.z-arm64.dmg` |
| macOS，Intel 芯片 | `ThoughtDAG-x.y.z.dmg` |
| Windows | `ThoughtDAG.Setup.x.y.z.exe` |
| Linux | `ThoughtDAG-x.y.z.AppImage` |

不确定自己的 Mac 是哪种芯片：苹果菜单 → 关于本机。列表里的 `.zip`、`.blockmap` 和 `.yml` 文件是应用内自动更新机制使用的，不需要手动下载。

macOS 版已由 Apple 签名与公证，双击即开。Windows 版暂未签名，在提示中选「更多信息 → 仍要运行」。装好之后应用会自己检查新版本（画布菜单 → 检查更新），检查之后的每一步都等你点击确认。

## 更多能力

| 能力 | 说明 |
|------|------|
| 📤 只读分享 | 一条链接携带整张图，无账号、不经服务器存储 |
| 🧭 陈旧重放 | 上游一改，受影响回答亮标记；按依赖序批量重放，先报 token 价 |
| ✂️ 摘取 | 阅读器里圈选文字、框选图表，摘成带页码出处的画布素材 |
| 🔌 模型自由 | 节点级钉选、沿线继承；纯文本模型经伴随文本读图 |
| 🔒 本地优先 | 自动文件夹备份写成真实文件，指向同步盘即跨设备 |

完整功能清单（60+ 条，按领域分组）→ [docs/features_ZH.md](docs/features_ZH.md)

## ThoughtDAG 有何不同

很多工具都把对话放上画布。真正的区别在于，连线做什么。

在 ThoughtDAG 里，连线不是装饰，也不是执行路径。它决定模型下一次看到什么。

| 类型 | 连线代表什么 | 更适合 |
|------|------------|--------|
| 线性聊天 | 时间顺序中的对话历史 | 简单、快速的问题 |
| 思维导图与白板 | 给人看的视觉关系 | 自由整理与展示 |
| 分支对话画布 | 对话的父子分支 | 探索不同回答路径 |
| 工作流与 Agent 画布 | 数据流或执行顺序 | 自动化和流程编排 |
| ThoughtDAG | 模型下一次真正接收的上下文 | 长线思考的人工分叉、合并、剪枝与追溯 |

如果你已经在用一个 markdown 文件手工维护决策树，ThoughtDAG 就是那棵树的可操作版本：你连进来的分支，就是模型读到的全部。

### 和 coding agent 并肩工作

给画布安一个文件夹，它就是一个自动更新的本地文件：打开**自动文件夹备份**，指到你的项目目录，你每落一个新节点，磁盘上的 `<画布名>.thoughtdag.json` 就跟着更新。而 coding agent 天生会读文件。集成的全部就是这样：

1. 让你的 agent CLI 读这个文件。`question`、`response`、`summaries` 字段承载完整的决策历史，包括哪些路已经被排除、为什么。
2. 要最干净的交接，用 **Markdown 导出**：任意上下文链或选区变成 agent 原生可读的 `.md`。

在任意 agent 会话里的用法示例：*「读一下 ./notes/research.thoughtdag.json，从里面的结论继续；summaries 字段列了已经排除的路线。」*

没有插件，没有 API，没有服务。同一份文件也是真实的数据安全：把备份指到网盘同步目录，它就是你的跨设备备份。

## 模型与订阅

智谱 · 通义 · OpenAI · Anthropic · Google · DeepSeek · Kimi · OpenRouter · Ollama，或任何兼容 OpenAI 协议的端点。纯文本模型经伴随文本读图，未识读的图才由视觉模型代答（有提示）。环境变量与默认模型 → [docs/setup_ZH.md](docs/setup_ZH.md)

**已经在付订阅费？直接接进来。** ChatGPT 订阅经一条命令的本地桥接入（配合本地运行的 ThoughtDAG）；GLM Coding 与 Kimi Code 订阅本身就发 API key，选预设、填 key 即可。三家的接法 → [docs/setup_ZH.md#订阅接入](docs/setup_ZH.md#订阅接入)

## 成本与隐私

- **免费档模型覆盖全部功能**；本地 Ollama 完全离线
- **桌面版一切都在本机**：画布、key、文档；在线 Demo 的模型流量浏览器直连，key 不经服务器
- **PDF 不离机**，只有提取文本随提问发出
- **备份格式向后兼容**；Markdown 导出是永久逃生门

---

<div align="center">

*图无环，环是人。*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features_ZH.md#roadmap) · [反馈](https://github.com/chenxiachan/thoughtdag/issues) · [引用](https://github.com/chenxiachan/thoughtdag#cite-this-repository)

</div>
