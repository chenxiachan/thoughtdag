---
name: thoughtdag
description: Open the current Codex session in ThoughtDAG (desktop app direct; local bridge fallback — data never leaves this machine), or query local session history with why / find / recall
---

[[thoughtdag:command]] (this marker lets the canvas importer prune this command turn — keep it as is)

Two uses, chosen by the argument. Communicate with the user in THEIR language (the one they have been using); these instructions being English does not make English the reply language.

**A. Query history**: when the argument starts with `why`, `find`, `recall` or `status`, this is a query — open no canvas. Pass it verbatim to the ThoughtDAG command line and show its output **as is**: do not read session files yourself, do not summarize or reword (the output is written to be read: Δ is an observed change, ≈ a candidate explanation read from an answer, ⤴ the earlier question a bare reply answered; the `thoughtdag://…` link ending each line opens that very turn via `open`). Find the command line in this order: ① `command -v thoughtdag` — use it if present; ② else `npx -y thoughtdag` (once published on npm); ③ a developer inside the ThoughtDAG repository: `node cli/dist/thoughtdag.mjs` (run `npm run cli:build` first if `cli/dist` is missing). Examples:

```bash
thoughtdag why --check src/lib/api.ts  # one line: does this file have history? exit 0 yes / 1 no — ask before editing
thoughtdag why src/lib/api.ts          # which turns touched this file, what changed, what was said
thoughtdag why arxiv:2506.07962        # papers, URLs and canvas attachment names are valid too
thoughtdag find "surrogate gradient"   # where these words were asked (Q) or said (≈), exact match
thoughtdag recall <session> <n>        # one turn in full
thoughtdag status                      # what the index holds, and how much is hard evidence
```

Pass every word after the skill name through as arguments. Codex turns an `@file` in the prompt into an attachment: when the text is just `why` (or `why` plus other flags) and a file arrived attached, that file is the target — use its path (or its name) as the argument; do not read its body, the query needs only the name. Never run the command with no argument. The index refreshes itself before a query; `thoughtdag index` is rarely needed by hand. Stop here.

**B. Open the session** (no argument, `list`, a session-id prefix, `harvest`). Rules and steps:

1. **Locate the session file**: Codex rollout JSONL files live under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (global, not per project). The current session = the **most recently modified** file within the last three days whose first `session_meta` line has `"cwd"` equal to the current working directory. Search newest-first:

```bash
for f in $(find ~/.codex/sessions -name 'rollout-*.jsonl' -mtime -3 -print0 | xargs -0 ls -t); do
  head -c 65536 "$f" | grep -q "\"cwd\":\"$PWD\"" && echo "$f" && break
done
```

If the argument is `list`, list the 5 most recent matching files (name, size, mtime) for the user to pick; if it is a session-id prefix, pick the matching file. The sessionId = the trailing UUID in the filename (`rollout-<timestamp>-<uuid>.jsonl`).

2. **Main road (desktop app)**: run `open "thoughtdag://open?session=<sessionId>"` (macOS; `xdg-open` on Linux, `start` on Windows). Exit code 0 = success — tell the user: the session is now open in the ThoughtDAG desktop app; the canvas routes itself (an existing canvas for this session continues at its break point, otherwise a fresh canvas is minted), and from now on the canvas follows this session automatically. **Never print or summarize the session content** — that is ThoughtDAG's job. Done.

3. **Fallback (open failed = desktop app missing or too old)**: use the local bridge. ① **Copy** the session JSONL to `~/Desktop/thoughtdag-session-$(date +%Y%m%d-%H%M).jsonl` (never modify the source). ② Clear leftovers with `lsof -ti :38017 | xargs kill 2>/dev/null`, then run in the background (`nohup … >/dev/null 2>&1 &`) with the snapshot path as `TD_SNAP`:

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

③ Probe `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`: running → `open "http://localhost:5173/#import-url=http://127.0.0.1:38017/session.jsonl"`; not running → offer three options: start `npm run dev` and retry / open the hosted app `open "https://app.thoughtdag.workers.dev/#import-url=http://127.0.0.1:38017/session.jsonl"` (data still never leaves the machine; the bridge lives two minutes) / drag the desktop snapshot into the canvas switcher → import. Close by telling the user the snapshot path and the opened address.
