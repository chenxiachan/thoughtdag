# Why 层：CLI 与只读 MCP

Why 层把本机 Claude Code、Codex 与 ThoughtDAG 画布里的对话放进同一份索引。从一个文件、一句原话、一个网址或 arXiv 论文编号出发，结果会指回命中的原始轮次。

## 安装

无需安装，先试一次查询：

```bash
npx thoughtdag why src/lib/api.ts
```

日常使用时，全局安装命令并建立本地索引：

```bash
npm install -g thoughtdag
thoughtdag index
```

### 接入只读 MCP 服务

在准备使用它的项目目录中运行：

```bash
thoughtdag setup mcp
```

它会为 Claude Code 写入当前项目的 `.mcp.json`，并在 `~/.codex/config.toml` 中注册 Codex MCP。查询仍以当前工作区为范围。MCP 服务只能检索与回忆，不能编辑画布或来源会话。

### 可选：加入项目规则

```bash
thoughtdag setup rules
thoughtdag setup rules --remove
```

第一条命令会在当前项目的 `CLAUDE.md` 与 `AGENTS.md` 中加入带标记的规则，要求 Agent 在改动文件前先检查相关历史。第二条命令只移除这段标记内容，不会写入全局指令文件。

## CLI 命令字典

| 命令 | 作用 |
|---|---|
| `thoughtdag index [--full] [--canvas <dir>]` | 建立或刷新索引；可同时记住画布备份目录 |
| `thoughtdag why <path> [--include-read] [--all] [--limit N] [--json]` | 显示碰过某个文件、网址或论文的轮次 |
| `thoughtdag why --check <path> [--fresh] [--json]` | 低成本检查这个对象是否存在历史 |
| `thoughtdag find "<phrase>" [--in q\|a\|m] [--limit N] [--json]` | 在问题、回答或材料中做不区分大小写的精确检索 |
| `thoughtdag recall <session> <n>` | 完整输出某一轮对话 |
| `thoughtdag status` | 查看索引规模与证据覆盖率 |
| `thoughtdag purge [--cache]` | 删除全部派生数据，或只删除可重建缓存 |
| `thoughtdag events <session-file> [--touches]` | 把一个来源文件投影为标准事件 |
| `thoughtdag mcp` | 通过 stdio MCP 提供四个只读工具 |
| `thoughtdag setup [mcp \| rules [--remove]]` | 查看或修改项目接入状态 |

`<path>` 可以是绝对路径、相对当前工作区的路径、网址，或 `arxiv:<id>`。

## MCP 工具字典

| 工具 | 参数 | 返回内容 |
|---|---|---|
| `why_check` | `path` | 一行说明该对象有无历史 |
| `why_file` | `path`，可选 `include_read`、`limit` | 命中的轮次与观察到的文件改动 |
| `find` | `phrase`，可选 `in`、`limit` | 问题（`q`）、回答（`a`）、材料（`m`）或全部范围内的精确命中 |
| `recall_turn` | `session`、`turn` | 一轮完整的问题、回答与工具轨迹 |

## 输出标记字典

| 标记 | 含义 |
|---|---|
| `Q` | 用户问题的原文片段 |
| `A` | Agent 回答的原文片段 |
| `M` | ThoughtDAG 画布节点所附的文字材料 |
| `Δ` | 从工具调用中观察到的编辑或写入 |
| `≈` | 从回答中提取的候选解释，不是已经核验的事实 |
| `↗` | 回到来源轮次或画布节点的入口 |

## 例子

### 找到修改过一个文件的对话

```text
$ thoughtdag why src/lib/api.ts
why src/lib/api.ts · 12 个相关轮次，来自 6 个会话
claude-code  ✏️ 修改  Q: 能否判断模型是否支持多模态？
             Δ storedProviders → storedProviders, storedVision…
```

需要同时查看只读操作时加 `--include-read`；需要取消默认结果上限时加 `--all`。

### 找到一个概念出现在哪里

```text
$ thoughtdag find "context.committed" --in q
find "context.committed" · 21 个相关轮次，来自 12 个会话
claude-code  Q: ……把 context.committed 加入事件契约……
codex        Q: ……context.committed 已经实现了一半……
```

用 `--in a` 只搜回答，用 `--in m` 只搜画布材料。

### 找到一篇论文或一个网页

```bash
thoughtdag why arxiv:2606.26733
thoughtdag why https://example.org/paper
thoughtdag find "arxiv" --in m
```

### 完整查看某个命中轮次

复制 `why` 或 `find` 输出中的会话 id 与轮次编号：

```bash
thoughtdag recall <session-id> <turn-number>
```

如果已安装桌面版，`↗` 链接会打开对应的轮次或画布节点。

需要可视化浏览会话、编辑上下文图时，继续阅读 [Agent 对话地图](./session-atlas)。
