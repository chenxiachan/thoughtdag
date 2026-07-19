<div align="center">

<img src="public/favicon.svg" width="72" alt="ThoughtDAG logo"/>

# ThoughtDAG

**思考值得一张地图。** 在无限画布上，AI 对话长成一张可编辑的思维图。

![React](https://img.shields.io/badge/React_19-087EA4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/许可-MIT-green)
![Status](https://img.shields.io/badge/状态-活跃开发中-6B5CE7)

**[▶ 在线试用](https://app.thoughtdag.workers.dev)** — 无需安装注册，示例画布免 key

[English](./README.md) · [快速开始](#快速开始) · [更多能力](#更多能力) · [支持的模型](#支持的模型) · [成本与隐私](#成本与隐私)

<img src="docs/hero-demo-zh.gif" alt="真实录屏的 Hero 演示：在 PDF 阅读器圈选段落提问；删掉噪音边重新生成干净答案；三层语义缩放缩到地图形态；打开备份控制中心导出真实文件" width="100%"/>

</div>

## 唯一法则

**长对话在稀释上下文，而你看不见模型读了什么。**
在这里，模型看到的精确等于连进节点的内容。删一条边，换一个答案。

**好答案埋在第 47 轮，再找到它像一场考古。**
缩小画布：收获句门牌和认知徽章，把画布变成你思考过程的地图。

**你的思考锁在别人的服务器里。**
画布在你的浏览器里；备份是你磁盘上的真实文件，随时带走。

ThoughtDAG 用一条法则替换整个黑箱：

> **连线即上下文。** 问题是节点，连线是上下文，编辑图，就是在编辑模型的记忆。

## 它长什么样

<table>
<tr>
<td width="45%"><img src="docs/illus/reading-zh.svg" alt="示意图：在原文页面圈选一段文字，旁边浮出紫色提问气泡，段落带 p.3 出处"/></td>
<td width="55%">

### 📖 把文献读成思维地图

读原版页面，圈选一段直接提问。答案在文档旁流式出现，问题带着页码落在画布上、连着材料；问过的段落留下印记，节点上的 p.N 芯片一键跳回那一页。**读完一篇论文，地图已经画好。**

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### 🧠 删一条边，换一个答案

合并分支是拖一条线，裁剪记忆是删一条线，归档的节点退出一切未来上下文。这个命题是可检验的：提示词一字不动，删掉噪音那条边，同一个问题返回干净的回答。**在示例画布第 ③ 区可以亲手复现。**

</td>
<td width="45%"><img src="docs/illus/prune-zh.svg" alt="示意图：研究主链与总结节点由实线相连，通往晚饭节点的边被剪断成红色虚线"/></td>
</tr>
</table>

<table>
<tr>
<td width="45%"><img src="docs/illus/map-zh.svg" alt="示意图：三个收获句门牌，分别带排除、决策、转向徽章，虚线相连"/></td>
<td width="55%">

### 🗺️ 缩小画布，思考自成地图

三层语义缩放：完整卡片、收获句门牌、图标骨架。每一步带认知徽章——✕ 排除 · ⚖ 决策 · ↩ 转向 · ? 待解。印章保持固定屏幕尺寸，缩得再远地图也不稀疏。**走过的弯路也是地图的一部分。**

</td>
</tr>
</table>

<table>
<tr>
<td width="55%">

### ✨ 你标的重点，串成带引用的文字

高光是你判断过的内容。总览按时间或按节点一处看全，每条可定位出处；勾选任意几条，串成每句可溯源的一段话。

</td>
<td width="45%"><img src="docs/illus/weave-zh.svg" alt="示意图：高光卡片里的一句话被串联进下方带引用编号的成文段落"/></td>
</tr>
</table>

## 快速开始

```bash
# 在线：app.thoughtdag.workers.dev（示例画布免 key）
# 本地：
npm install
npm run server    # LLM 代理 :3001
npm run dev       # → localhost:5173
# 无 .env 时，在应用内连接任意兼容 OpenAI 协议的接口即可
```

首次打开是预置的示例画布：围绕「收藏夹为什么总在吃灰」展开四章，含一份内嵌真 PDF 的阅读闭环。环境变量、免费 key 与配置细节 → [docs/setup_ZH.md](docs/setup_ZH.md)

## 更多能力

| 能力 | 说明 |
|------|------|
| 📤 只读分享 | 一条链接携带整张图，无账号、不经服务器存储 |
| 🧭 陈旧重放 | 上游一改，受影响回答亮标记；按依赖序批量重放，先报 token 价 |
| 🧪 范式 | 人机工作流存成文件；改输入重放整个实验 |
| 🔌 模型自由 | 节点级钉选、沿线继承；带图请求自动改道视觉模型 |
| 🔒 本地优先 | 自动文件夹备份写成真实文件，指向同步盘即跨设备 |

完整功能清单（60+ 条，按领域分组）→ [docs/features_ZH.md](docs/features_ZH.md)

## 支持的模型

智谱 · 通义 · OpenAI · Anthropic · Google · DeepSeek · Kimi · OpenRouter · Ollama，或任何兼容 OpenAI 协议的端点。带图请求自动改道视觉模型。环境变量与默认模型 → [docs/setup_ZH.md](docs/setup_ZH.md)

## 成本与隐私

- **免费档模型覆盖全部功能**；本地 Ollama 完全离线
- **在线 Demo 的模型流量浏览器直连**，key 不经服务器
- **PDF 不离机**，只有提取文本随提问发出
- **备份格式向后兼容**；Markdown 导出是永久逃生门

## 引用

如果 ThoughtDAG 在你的研究中发挥了作用，请引用（GitHub 的 "Cite this repository" 按钮使用仓库内的 `CITATION.cff`）：

```bibtex
@software{thoughtdag,
  author = {Chen, Xia},
  title  = {ThoughtDAG: an instrument for legible human-AI collaboration},
  url    = {https://github.com/chenxiachan/thoughtdag},
  year   = {2026},
  license = {MIT}
}
```

---

<div align="center">

*图无环，环是人。*

[MIT](./LICENSE) © 2026 Xia Chen · [Roadmap](docs/features_ZH.md#roadmap) · [反馈](https://github.com/chenxiachan/thoughtdag/issues)

</div>
