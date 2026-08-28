---
description: 把当前 Codex 会话直接打开到 ThoughtDAG 画布（本地桥接，数据不出本机）
argument-hint: "[list | 会话id前缀 | harvest]"
---

把当前 Codex 会话送进 ThoughtDAG：导出只读快照 → 起一个短命的本机桥 → 打开本地 ThoughtDAG，画布自动完成导入。规则与步骤：

1. **定位会话文件**：Codex 的会话 rollout JSONL 按日期存放在 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`（全局，不分项目）。当前会话 = 近三天内**最近修改**、且首行 `session_meta` 里 `"cwd"` 等于当前工作目录的那个文件。查找方式（按修改时间从新到旧逐个查首行）：

```bash
for f in $(find ~/.codex/sessions -name 'rollout-*.jsonl' -mtime -3 -print0 | xargs -0 ls -t); do
  head -c 4000 "$f" | grep -qF "\"cwd\":\"$PWD\"" && { echo "$f"; break; }
done
```

若无命中（目录改过名等），退为全局最新的 rollout 并明确告知用户选的是哪个。参数 `$ARGUMENTS` 为 `list` 时改为列出最近 5 个 rollout（文件名、cwd、大小、修改时间）等用户挑选；为某会话 id 前缀时选中文件名匹配的 rollout；为 `harvest` 时仍取当前会话，但第 4 步打开的 URL 额外带 `&mode=harvest` —— 画布会读取会话首条消息里的实验锚点，把这次实验作为支线**挂回它出发的节点**（收获模式；锚点缺失时自动退为普通导入）。

2. **只读快照**：把选中的 rollout **复制**到 `~/Desktop/thoughtdag-codex-session-$(date +%Y%m%d-%H%M).jsonl`。绝不修改、移动或删除源文件。（正在写入的文件可安全复制，导入器容忍尾部截断行。）

3. **起本机桥**（serve 这一个快照文件，120 秒后自动退出）。先清残留：`lsof -ti :38017 | xargs kill 2>/dev/null`，然后以快照路径为 `TD_SNAP` 环境变量，后台运行下面的脚本（`nohup … >/dev/null 2>&1 &`）：

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

桥只绑 127.0.0.1、只回这一个文件、CORS 只回显 ThoughtDAG 的来源，两分钟后自毁。若沙箱拦截绑定端口或 `open`，按权限升级流程请求放行——这两步只读快照文件、只绑本机回环。

4. **打开本地 ThoughtDAG**：探测 `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`：
   - **5173 在跑** → `open "http://localhost:5173/#import-url=http://127.0.0.1:38017/session.jsonl"`（harvest 模式在末尾追加 `&mode=harvest`），画布会自动识别 Codex rollout 并导入（每轮问答一个节点、工具调用成可单独排除的附件、默认最近 200 轮，视角落在最新几轮）。
   - **不在跑** → 告诉用户三选一：① 在 ThoughtDAG 目录 `npm run dev` 起本地版后重新运行本命令；② 打开线上版（数据同样不出本机，桥只认本机来源）：`open "https://app.thoughtdag.workers.dev/#import-url=http://127.0.0.1:38017/session.jsonl"`（桥两分钟内有效）；③ 手动把桌面上的快照文件从画布切换器 → 导入拖入。

5. **收尾告知**：快照路径 + 已打开的地址 + 一句「导入的画布暂存浏览器本地，提示条里可一键开启自动备份落成文件」。不要打印或总结会话内容本身——那是 ThoughtDAG 的工作。
