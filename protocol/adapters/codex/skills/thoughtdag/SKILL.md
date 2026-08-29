---
name: thoughtdag
description: Open the current Codex session in ThoughtDAG as an editable canvas (local bridge — data never leaves this machine). Trigger when the user asks to "send/open this session in thoughtdag", "turn the session into a graph/canvas", "see the context map", or to "harvest an experiment back to the graph". Do not trigger for tasks unrelated to session visualization.
---

[[thoughtdag:command]] (this marker lets the canvas importer prune this command turn — keep it as is)

Send the current Codex session into ThoughtDAG: export a read-only snapshot → start a short-lived loopback bridge → open the local ThoughtDAG, where the canvas imports it automatically. Communicate with the user in THEIR language (the one they have been using); these instructions being English does not make English the reply language. Rules and steps:

1. **Locate the session file**: Codex rollout JSONL files live under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (global, not per project). The current session = the **most recently modified** file within the last three days whose first `session_meta` line has `"cwd"` equal to the current working directory. Search newest-first:

```bash
for f in $(find ~/.codex/sessions -name 'rollout-*.jsonl' -mtime -3 -print0 | xargs -0 ls -t); do
  head -c 4000 "$f" | grep -qF "\"cwd\":\"$PWD\"" && { echo "$f"; break; }
done
```

If nothing matches (renamed directory etc.), fall back to the globally newest rollout and tell the user explicitly which one was chosen. If the user asks to "list sessions", list the 5 most recent rollouts (filename, cwd, size, mtime) for them to pick; if they give a session-id prefix, select the matching rollout; if they ask to **harvest an experiment**, still take the current session but append `&mode=harvest` to the URL opened in step 4 — the canvas reads the experiment anchor in the session's first message and hangs this experiment as a branch **back onto the node it departed from** (a missing anchor falls back to a plain import automatically).

2. **Read-only snapshot**: **copy** the selected rollout to `~/Desktop/thoughtdag-codex-session-$(date +%Y%m%d-%H%M).jsonl`. Never modify, move, or delete the source file. (A file still being written is safe to copy — the importer tolerates a truncated tail line.)

3. **Start the loopback bridge** (serves this one snapshot, self-destructs after 120 seconds). Clear leftovers first: `lsof -ti :38017 | xargs kill 2>/dev/null`, then run the script below in the background (`nohup … >/dev/null 2>&1 &`) with the snapshot path in the `TD_SNAP` environment variable:

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

The bridge binds 127.0.0.1 only, serves this one file only, echoes CORS only for ThoughtDAG's origins, and self-destructs in two minutes. If the sandbox blocks the port bind or `open`, request escalation through the approval flow — these steps only read the snapshot and bind the local loopback.

4. **Open the local ThoughtDAG**: probe with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`:
   - **5173 is up** → `open "http://localhost:5173/#import-url=http://127.0.0.1:38017/session.jsonl"` (append `&mode=harvest` when harvesting). The canvas recognizes the Codex rollout and imports it (one node per Q/A turn, tool calls as individually excludable attachments, every turn imported faithfully, the view landing on the newest turns).
   - **Not up** → offer the user three roads: ① run `npm run dev` in the ThoughtDAG directory, then rerun; ② open the hosted app (data still never leaves the machine — the bridge only answers local origins): `open "https://app.thoughtdag.workers.dev/#import-url=http://127.0.0.1:38017/session.jsonl"` (the bridge stays alive for two minutes); ③ drag the Desktop snapshot into the canvas switcher → import.

5. **Wrap up**: report the snapshot path + the opened address + one line noting that the imported canvas lives in browser-local storage and the toast bar offers one-click automatic backups to a file. Do NOT print or summarize the session content itself — that is ThoughtDAG's job.
