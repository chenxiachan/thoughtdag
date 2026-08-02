这不是另一个 ThoughtDAG，而是一套更宽、更强调 Agent 行动的空间工作台。

它验证了“线性聊天装不下复杂工作”这个需求，却也让 ThoughtDAG 必须把“边直接决定模型上下文”讲得更锋利。

# 基本信息

- 标题：在MSRA的最后一个开源项目release啦
- 作者：wzwzl
- 发布时间：2026-07-27
- 原文：https://www.xiaohongshu.com/explore/6a66cf25000000000101f5f8
- 产品：Huabu
- 官方仓库：https://github.com/microsoft/Huabu
- 采集时互动：59 赞、62 收藏、6 评论、18 分享

# 视频讲了什么

Huabu 把聊天、链接、论文、笔记、问题和生成结果放到一个无限画布中。用户用位置、分组、连线和标注表达意图，Agent 可以阅读这些空间信息，也可以创建、移动、连接或删除画布内容。

视频的叙事路径是：

1. 从散落在聊天、标签页与文件里的工作开始；
2. 把内容拖到共享画布；
3. 用空间关系整理资料与研究演化；
4. 从画布发问，让周围工作成为上下文；
5. 让多个 Agent 并行生成页面、运行图和参考资料；
6. 结果回到原问题旁边，继续修改。

核心口号是：`Collect what matters, organize it together, act with your agents.`

# 实际产品机制

- Space 是二维无限工作区，节点承载材料与想法，边表达关系，Frame 组织区域。
- 节点包括 Note、Text、Image、PDF、Video、Web、Frame、Sketch、Agent。
- AI 有三种表面：可修改画布的 Agent、就近工作的 Agent Node、只读问答的 Chat。
- 用户选择的节点会作为引用发送；Agent 还可以按需检查周围、同一 Frame、附近或相连节点。
- Agent 的画布修改带 review card，可逐项保留或回退。
- 支持本地 ACP Agent，并允许这些 Agent 直接编辑当前 Space。
- 自动维护用户记忆和 Space 记忆，均为本地 Markdown；拓扑保存在 `space.json`。

# 与 ThoughtDAG 的根本区别

Huabu 的空间、位置和边帮助 Agent 推断意图并寻找上下文；它们更像语义提示和行动环境。

ThoughtDAG 的边则是上下文协议：沿入边遍历祖先并构造实际消息。删除一条边再运行同一问题，删除分支不再进入模型请求。

因此：

- Huabu：work around you becomes context。
- ThoughtDAG：wires are the context。

前者强调 Agent 在空间中行动；后者强调人可以检查、编辑并复现实发给模型的上下文。

# 对 ThoughtDAG 的启示

- 不要再用“无限画布”“PDF 阅读”“本地优先”“人和 AI 一起思考”作为首要差异，它们已成为品类共同语言。
- 首屏演示应直接展示：同一问题、删除一条边、实际上下文和答案随之改变。
- 可以借鉴 review/revert，但应把它用于“模型建议上下文边，由人确认”，不能让 Agent 静默改写上下文。
- 应增加或突出 Context Inspector：明确展示本次请求包含哪些节点、排序为何、删除边前后差异。
- 不要扩张成通用 Agent 画布。微软在产品广度、桌面体验和 Agent 生态上更有优势；ThoughtDAG 应缩到可审计的上下文控制。

# 开源与成熟度核验

截至 2026-07-27，公开仓库约 62 stars、4 forks，最新版本为 v0.9.1。已有 Apple Silicon 与 Windows x64 安装包，但 README 明确写着应用源代码将在未来发布；当前公开仓库主要是文档和网站材料。因此“小红书所说的开源项目”目前只能算部分成立。

产品仍属研究原型。官方 RAI 文档说明尚未系统处理间接提示注入，主要以英文设计和测试，需要人工审查。现有 issue 也出现多轮上下文丢失、外部 Agent 子进程残留及对话线程访问等问题。

# 一句话判断

Huabu 证明“空间化 AI 工作台”正在成为真实品类；ThoughtDAG 的机会不是做得像它一样宽，而是把“上下文从模糊环境变成可编辑、可检查、可复现的图协议”做到极致。
