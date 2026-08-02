# Huabu 交互、Agent 与传播素材拆解

## 结论

Huabu 最值得 ThoughtDAG 借鉴的不是“多 Agent”，而是三件事：

1. 每个抽象概念都用一个真实界面动作证明；
2. 官网和视频使用同一套故事结构；
3. 模型、工具与外部 Agent 的责任边界在设置界面中分得很清楚。

ThoughtDAG 应借这个表达系统，但把故事主角从“Agent 执行任务”换成“人编辑模型真实收到的上下文”。

## Huabu 的 AI 到底从哪里来

### 内置 Huabu Chat / Huabu Agent

- 用户必须配置 Chat Model，它负责对话、Agent 工作、工具选择、画布修改和 Skills。
- 配置需要 Provider、凭证或登录，以及 Chat Model；Azure OpenAI 使用 Deployment。
- 官方截图显示一种路径是 OpenAI Codex 登录，并从账户中选择模型。
- 其他 Provider 通常需要用户提供 API 凭证。官方文档没有公开完整 Provider 列表，不能推断它支持所有主流接口。
- Utility Model 可选，用于记忆整理、标签、摘要、关键词、Skill 创建等轻量任务。
- Utility Model 可以选 Automatic (cheapest)；无法确认廉价模型时回退到 Chat Model。
- 图片生成单独配置，目前文档要求 Azure OpenAI image deployment。
- Web Search 需要用户提供 Tavily API key。
- YouTube transcript 需要用户提供 RapidAPI key。
- App 中保存的凭证使用操作系统保护存储加密。

因此，Huabu 不是免费提供一套微软模型。主要模式是 BYOK 或账户登录。

### 外部 Agent

Huabu 可以在本机启动 ACP-compatible Agent，并把当前 Space 暴露给它。外部 Agent 自己负责：

- 模型访问；
- 登录和认证；
- 工具；
- 权限；
- 使用费用。

Huabu 负责：

- 启动本地 Agent 进程；
- 维护工作目录和会话；
- 把 Space 的节点、内容和布局交给 Agent；
- 显示 Agent 状态与权限请求；
- 记录、review 和 undo Agent 对 Space 的修改。

当前文档列出的自动检测项包括 GitHub Copilot、Claude Agent、Gemini、Codex ACP、Qwen Code、Kimi Code、OpenCode 和 Cursor，也支持自定义 ACP 命令。

这是两条完全不同的通道：

```text
Huabu built-in Agent
  -> Huabu 读取用户配置的模型
  -> Huabu 自己执行 Space 工具

External ACP Agent
  -> Huabu 启动本地 Agent
  -> Agent 自己处理模型、登录、工具与费用
  -> Huabu 只作为画布宿主和权限层
```

## 官网的交互是怎样实现的

公开官网不是视频假装的交互，而是一个真正的 scroll-driven DOM 场景。

- 首屏是传统产品 hero，加一段可播放的 2:05 product film。
- 第二部分是一段约 9–11 屏的 sticky scroll story。
- 故事舞台固定为一个无限画布，滚动只改变“相机”位置、缩放和对象状态。
- 虚拟画布约 7000 × 3700px。
- 节点、边、Frame、Agent 状态和 Camera keyframes 都是数据数组。
- 滚动进度映射到：
  - Camera 的 x / y / zoom；
  - 节点 reveal；
  - 节点拖动与重新排列；
  - 边的出现与消失；
  - Agent 状态从 Reading context 到 Working、Returning result、Done；
  - 字幕说明卡的淡入淡出；
  - 最后的全图缩放。
- 使用 requestAnimationFrame 和缓动追随，避免滚轮造成跳帧。
- 有 prefers-reduced-motion 降级。
- 右侧章节 rail 可直接跳到故事节点。

它的有效性来自“一个连续空间”，而不是复杂 WebGL：

```text
滚动
  -> 改变故事进度
  -> 相机穿过同一张画布
  -> 对象逐步出现、移动、连线、返回结果
  -> 最后缩远看到整个工作结构
```

## 视频的制作结构

官方 product film：

- 2560 × 1440；
- 30fps；
- 2:05；
- H.264 视频；
- AAC 48kHz stereo；
- 独立 VTT 字幕，同时 MP4 内嵌字幕轨。

内容不是逐项介绍功能，而是一条工作变化曲线：

1. 痛点：工作散落在 chats、tabs、files；
2. 外化：把想法从聊天拖到画布；
3. 引入材料：links、papers、notes、questions；
4. 组织：Agent 按研究演化排列论文；
5. 就地提问：周围工作成为 context；
6. 局部证据：句子或图从论文进入 Space；
7. 行动：多个 Agent 并行完成目标；
8. 返回：结果留在原问题旁边并可继续修改；
9. 收束：Collect → Organize → Act。

语音文案的基本单位是“一句判断 + 一个真实动作”，不是功能清单。

## 对 ThoughtDAG 产品交互的借鉴

### P0：应优先强化

#### 1. 把“将发送”升级为产品的核心状态

当前已有 context preview，但它应像 Huabu 的 Agent status 一样成为视觉主角：

- 选中目标节点时，高亮实际会进入请求的整条上游路径；
- 未进入上下文的节点降到低对比度；
- 面板固定显示节点数、token 数、引用数；
- 删除边以后，立即显示 context diff。

这相当于 ThoughtDAG 的“可见运行状态”，比模仿 Agent avatar 更符合产品。

#### 2. 删边时显示可撤销的 Context Change Card

借鉴 Huabu review/revert，但只用于上下文：

```text
已移除一条上下文边
晚饭分支不再发送
−47 tokens

[查看差异] [撤销]
```

这会让“边是模型输入”从抽象概念变成一个持续可感知的反馈循环。

#### 3. 用 context halo 表示“模型当前看见的范围”

在打开提问面板或“将发送”时：

- 上游节点带紫色 halo；
- 全量边加深；
- 虚线引用保留浅色；
- 无关节点退到 30% opacity。

Huabu 用空间 halo 表示 Agent 可检查周围；ThoughtDAG 应用它表达确定性的上下文闭包。

#### 4. 空画布入口进一步收敛

当前空画布同时出现提问、文档、三张差异卡、范式入口、示例和教程。它说明得很完整，但第一眼选择过多。

建议保留两条英雄路径：

1. 输入一个问题；
2. 拖入一篇文档。

下面只留一个可播放的 20 秒“删边证明”和一个“载入示例画布”入口。范式与完整教程进入二级入口。

### P1：适合实验

#### 5. 让模型建议边，但不直接修改

Agent 可以给出：

> 这条“晚饭”分支似乎与当前研究总结无关。建议移出上下文。

用户可以：

- 接受；
- 忽略；
- 查看删边后的预估 token 和上下文 diff。

这借鉴 Huabu Agent 的建议与 review，但不打破 ThoughtDAG 的 human-in-the-loop 边界。

#### 6. 拖出回答中的内容，形成显式材料节点

Huabu 的强手势是把回答块、PDF 句子和图直接拖到 Space。

ThoughtDAG 已经支持选中文字分支和 PDF 圈选提问，可以进一步统一成：

- 拖出文字 → Note / Evidence node；
- 从节点拖线 → 选择完整上下文或显式引用；
- 来源页码和原节点始终保留。

#### 7. 模型设置按“必要 / 可选能力”分层

Huabu 把 Chat Model、Utility Model、Image Generation、Web Search 分开说明。

ThoughtDAG 可以把当前模型接口管理器改成：

```text
开始对话
  必须：至少一个 Chat Model

可选能力
  图片理解
  联网搜索
  本地模型
  学术检索
```

用户需要的是能力结果，不是先理解所有 Provider。

## 不建议借鉴

- 不增加多个 Agent avatar 作为产品主叙事；
- 不让 Agent 自动重排或删除上下文边；
- 不引入自动维护的空间语义来替代确定性遍历；
- 不用“Agent OS / agent-era shell”竞争通用工作台；
- 不复制 Huabu 的纸张手绘视觉，应保持 ThoughtDAG 自己的紫色实线、橙色分支和认知徽章。

## 已制作的 ThoughtDAG 对应资产

### 竖版产品视频

- 1080 × 1920；
- 30fps；
- 60.4 秒；
- 中文语音旁白；
- 烧录式中文字幕；
- 背景音乐；
- 使用真实产品录屏；
- 叙事主线：痛点 → 图 → 边语义 → context preview → 删边 → 同问重答 → 材料 → human control。

输出：

```text
video/out/product-film-zh.mp4
```

### 滚动交互网站

结构：

1. Hero：不要只看对话历史，直接编辑模型上下文；
2. 线性聊天：上下文隐形；
3. 对话变成图；
4. Will Send 预览；
5. 删除边与 token diff；
6. 同问重答；
7. 全图收束：图就是上下文协议。

输出：

```text
marketing/story-site/index.html
```

## 官方来源

- https://microsoft.github.io/Huabu/
- https://microsoft.github.io/Huabu/docs/
- https://microsoft.github.io/Huabu/docs/ai/models-and-capabilities
- https://microsoft.github.io/Huabu/docs/ai/external-agents
- https://microsoft.github.io/Huabu/docs/work-with-ai
- https://github.com/microsoft/Huabu
