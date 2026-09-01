# 安装与快速开始

ThoughtDAG 把 LLM 对话变成一张可编辑的图。每个节点是一轮问答，连进节点的内容决定模型下一次真正看到什么。

::: tip 推荐使用桌面版
桌面版提供完整体验：本机会话发现、Agent 对话地图、自动文件夹备份、内置搜索与工具，以及桌面更新。

**[下载 ThoughtDAG](https://chenxiachan.github.io/thoughtdag/?lang=zh#download)** · [全部版本](https://github.com/chenxiachan/thoughtdag/releases/latest)
:::

## 安装桌面版

### macOS

使用 Homebrew：

```bash
brew install --cask thoughtdag
```

macOS 构建已经签名和公证，也可以从[官方下载页](https://chenxiachan.github.io/thoughtdag/?lang=zh#download)获取。

### Windows 与 Linux

在[下载页](https://chenxiachan.github.io/thoughtdag/?lang=zh#download)选择对应安装包。Windows 构建暂未签名，系统可能显示 SmartScreen 提示。

## 不到一分钟了解界面

下面是真实应用录屏：从文档提问、移除不需要的上下文路径、从完整回答缩放到地图，再打开备份与导出控制。

<img src="../hero-demo-zh.gif" alt="ThoughtDAG 桌面版总览：文档提问、编辑上下文边、语义缩放、备份，以及用 Session Atlas 延续项目上下文" width="100%" loading="lazy"/>

## 第一次打开：选择开始方式

首次页面提供四个入口。你可以先浏览示例和现有工作，再决定是否连接模型。

![ThoughtDAG 中文首次页面：提问、材料、Agent 对话地图与模型连接入口](/screenshots/onboarding/zh/landing-zh-annotated.png)

> 红色说明框与虚线是文档标注，不属于 ThoughtDAG 界面。[查看无标注截图](/screenshots/onboarding/zh/landing-zh.png)。

1. **提出问题**：连接模型后，从一个真实问题建立第一张图；
2. **加入材料**：拖入 PDF、图片或其他文件。打开和阅读不需要模型，提问与识读需要模型；
3. **打开本地 Agent 会话**：进入 [Agent 对话地图](/zh/guides/session-atlas)，查看镜像图不需要模型；
4. **连接模型**：为生成回答、识读图片和凝练内容准备模型。

如果只想先认识软件，页面下方的**载入示例画布**无需任何配置。

## 连接第一个模型

需要生成内容时，点击**连接模型**。选择一种方式即可，不需要同时配置所有入口。

![ThoughtDAG 中文模型连接窗口：连接方式、授权、API key 与保存边界](/screenshots/onboarding/zh/connect-model-zh-annotated.png)

> 截图中的红色说明框是文档标注。[查看无标注截图](/screenshots/onboarding/zh/connect-model-zh.png)。

- **最快开始**：使用界面中的一键授权；
- **已有 API key**：选择对应服务商预设并粘贴 key；
- **本地模型**：选择 Ollama，或使用自定义 endpoint。

完成流程是：**选择入口 → 授权或填写 key → 获取模型列表 → 勾选模型 → 保存**。连接信息的保存边界会显示在窗口中；服务商、订阅、本地模型和开发者配置见[连接模型](/zh/setup)。

## 接下来

1. 加载示例画布，或者提出第一个真实问题；
2. 进入[认识界面](/zh/guides/interface-overview)，了解工具栏、节点、连线和侧栏；
3. 如果要继续本地 Agent 工作，查看 [Agent 对话地图配置](/zh/guides/session-atlas#配置-sources-与一键接入)。

**[按功能区查看完整说明 →](/zh/guides/)**

## 其他运行方式

### 在线 Demo

[在线 Demo](https://app.thoughtdag.workers.dev)适合快速查看基本交互，但它是功能子集，不能访问本地桌面会话或文件夹备份。

### 从源码运行

```bash
npm install
npm run server
npm run dev
```

打开 `http://localhost:5173`。模型接口可以直接在应用内配置，因此 `.env` 不是必需的。
