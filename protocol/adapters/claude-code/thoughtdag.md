---
description: 把当前 Claude Code 会话在 ThoughtDAG 中打开（桌面版直连；无桌面版时走本机桥）；或用 why / find / recall 查本机会话历史
---

两种用法，按参数分流：

**A. 查历史**：参数以 `why`、`find`、`recall`、`status` 开头时，这是一次查询，不打开任何画布。原样交给 ThoughtDAG 命令行，把它的输出**逐字**贴给用户，不要自己去读会话文件、不要总结或改写（输出本身就是为阅读设计的：Δ 是观察到的改动，≈ 是回答里的候选解释，⤴ 是空应答承接的上一个问题，每一行末尾的 `thoughtdag://…` 深链用 `open` 可直接落到那一轮）。找命令行的顺序：① `command -v thoughtdag` 有则直接用；② 否则 `npx -y thoughtdag`（npm 发布后可用）；③ 开发者在 ThoughtDAG 仓库内时，`node cli/dist/thoughtdag.mjs`（`cli/dist` 不存在就先 `npm run cli:build`）。例：

```bash
thoughtdag why --check src/lib/api.ts  # 一行：这个文件有没有历史（退出码 0 有、1 无），改文件前先问这句
thoughtdag why src/lib/api.ts          # 哪几轮对话动过这个文件、改了什么、当时说了什么
thoughtdag why arxiv:2506.07962        # 论文、网址、画布附件名都是合法的对象
thoughtdag find "surrogate gradient"   # 在哪几轮被问过（Q）或说过（≈），精确匹配
thoughtdag recall <session> <n>        # 把某一轮完整摊开
thoughtdag status                      # 索引里有什么、多少是确定证据
```

参数里的 `@文件` 是 Claude Code 的引用语法，它会先把整个文件读进对话：查询不需要文件正文，剥掉 `@` 把名字交给命令行即可（命令行本身也会剥），**不要**去读或引用被附带进来的正文。提醒用户下次直接写文件名。索引在查询前会自己刷新，通常不必手动 `thoughtdag index`。到此结束。

**B. 打开会话**（无参数、`list`、会话 id 前缀、`harvest`）：把当前 Claude Code 会话在 ThoughtDAG 中打开。规则与步骤：

1. **定位会话**：当前项目的会话 JSONL 在 `~/.claude/projects/<项目路径 slug>/` 下（slug = 项目绝对路径把 `/` 和 `.` 替换为 `-`）。用 `ls -t` 取该目录**最近修改**的 `.jsonl` 即当前会话。参数为 `list` 时改为列出最近 5 个会话（文件名、大小、修改时间）等用户挑选；为某会话 id 前缀时选中匹配文件。sessionId = 文件名去掉 `.jsonl`。

2. **主路（桌面版）**：运行 `open "thoughtdag://open?session=<sessionId>"`。退出码为 0 即成功——告诉用户：会话已在 ThoughtDAG 桌面版打开，画布自动路由（这个会话已有画布则续接到断点，否则生成新画布），此后画布会持续跟随这个会话自动生长。**不要打印或总结会话内容**——那是 ThoughtDAG 的工作。到此结束。

3. **回退（open 失败 = 未装桌面版或版本过旧）**：走本机桥。① 把会话 JSONL **复制**到 `~/Desktop/thoughtdag-session-$(date +%Y%m%d-%H%M).jsonl`（绝不改动源文件）。② 清残留 `lsof -ti :38017 | xargs kill 2>/dev/null`，然后以快照路径为 `TD_SNAP` 环境变量后台运行（`nohup … >/dev/null 2>&1 &`）：

```python
import http.server, socketserver, os, threading, re
data = open(os.environ['TD_SNAP'], 'rb').read()
OK = re.compile(r'^(http://(localhost|127\.0\.0\.1)(:\d+)?|https://app\.thoughtdag\.workers\.dev)$')
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        o = self.headers.get('Origin', '')
        self.send_response(200)
        if OK.match(o): self.send_header('Access-Control-Allow-Origin', o)
        self.send_header('Content-Type', 'application/x-ndjson')
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 38017), H)
threading.Timer(120, lambda: os._exit(0)).start()
srv.serve_forever()
```

③ 探测 `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`：在跑 → `open "http://localhost:5173/#import-url=http://127.0.0.1:38017/session.jsonl"`；不在跑 → 三选一告知用户：`npm run dev` 后重试 / 打开线上版 `open "https://app.thoughtdag.workers.dev/#import-url=http://127.0.0.1:38017/session.jsonl"`（数据不出本机，桥两分钟内有效）/ 把桌面快照手动拖入画布切换器 → 导入。收尾告知快照路径与打开的地址。
