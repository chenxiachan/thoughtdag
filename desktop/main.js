// ThoughtDAG desktop shell — a thin window around the SAME app:
// the bundled server.mjs runs as a child, serves the built dist on a
// local port, and this window points at it. No second stack: everything
// the web app is, the desktop app is.
const { app, BrowserWindow, shell, utilityProcess, ipcMain, dialog } = require('electron');
const path = require('path');
const net = require('net');
const os = require('os');
const fsp = require('fs/promises');

// Development: the repo root (live dist + server.mjs + root node_modules).
// Packaged: a self-contained payload under Resources — same three files,
// prepared by scripts/prepare-payload.mjs with production deps only.
const ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'payload')
  : path.join(__dirname, '..');
let serverProc = null;
let win = null;

// first free port from a quiet base — never collide with dev servers
function freePort(start = 31173) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(freePort(start + 1)));
    probe.once('listening', () => probe.close(() => resolve(start)));
    probe.listen(start, '127.0.0.1');
  });
}

async function waitReady(port, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/models`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function boot() {
  const port = await freePort();
  serverProc = utilityProcess.fork(path.join(ROOT, 'server.mjs'), [], {
    cwd: ROOT, // .env resolves from the project root, same as `npm run server`
    // HOST is forced to loopback AFTER the spread: the desktop shell only ever
    // connects to 127.0.0.1, so the bundled server must never bind anything
    // else — not even if the user's ambient environment carries HOST=0.0.0.0.
    // The HOST opt-in escape hatch is for `npm run server` power users only.
    env: { ...process.env, PORT: String(port), SERVE_DIST: path.join(ROOT, 'dist'), HOST: '127.0.0.1' },
    stdio: 'pipe',
    serviceName: 'thoughtdag-server',
  });
  serverProc.stdout?.on('data', (d) => console.log('[server]', String(d).trimEnd()));
  serverProc.stderr?.on('data', (d) => console.error('[server]', String(d).trimEnd()));

  win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'ThoughtDAG',
    backgroundColor: '#FAF9F7',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // splash first: the window exists from the first moment, breathing,
  // while the bundled server warms up behind it
  win.loadFile(path.join(__dirname, 'splash.html'));
  // external links belong to the system browser, not this window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const ready = await waitReady(port);
  if (!ready) {
    win.loadURL(`data:text/html,<pre>ThoughtDAG server failed to start on port ${port}.\nCheck the terminal output.</pre>`);
    return;
  }
  // ?dv= identifies the desktop build to the web layer; &su=1 tells it the
  // shell self-updates, so the in-page download nudge stays quiet.
  win.loadURL(`http://127.0.0.1:${port}/?dv=${encodeURIComponent(app.getVersion())}&su=1`);
}

// ─── Session atlas: read-only access to runner session stores ───────────
// The shell exposes four fenced primitives; ALL runner knowledge (formats,
// meta parsing, grouping) lives in the web layer's adapter code. The
// renderer never passes absolute paths — only a whitelisted root key plus
// a relative path that must resolve inside that root. Read-only by
// contract: no primitive here can write, move, or delete a session file.
const BUILTIN_ROOTS = process.env.TD_SESSION_ROOTS
  ? JSON.parse(process.env.TD_SESSION_ROOTS) // test harness only: point the atlas at fixture stores
  : {
    'claude-projects': path.join(os.homedir(), '.claude', 'projects'),
    'codex-sessions': path.join(os.homedir(), '.codex', 'sessions'),
  };
// Custom roots join the whitelist ONLY through the native directory picker
// (sessions:add-root) — the page can never name a path in a string. They
// persist under userData, owned by the shell, out of the page's reach.
let customRoots = {};
const rootsFile = () => path.join(app.getPath('userData'), 'atlas-roots.json');
async function loadCustomRoots() {
  try { customRoots = JSON.parse(await fsp.readFile(rootsFile(), 'utf8')); } catch { customRoots = {}; }
}
const allRoots = () => ({ ...BUILTIN_ROOTS, ...customRoots });

function resolveInRoot(rootKey, rel) {
  const root = allRoots()[rootKey];
  if (!root) throw new Error('unknown session root');
  const abs = path.resolve(root, String(rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('path escapes session root');
  return abs;
}

// ─── Terminal registry ─────────────────────────────────────────────────
// One entry per terminal the shell knows how to drive:
//   { id, name, probe(): Promise<bool>, launch(cwd, program): Promise<bool> }
// program is the bare runner command ('claude --resume <id>'); every
// launcher owns its platform's way of "open a terminal at cwd, run this,
// keep the window". Probed, never assumed — the picker lists only what
// this machine actually has. macOS entries are live-verified; Windows and
// Linux entries follow each terminal's documented CLI and await a real
// machine. Any terminal the registry can't drive (or a launch that fails)
// falls back to the clipboard road — never a broken window.
const { spawn } = require('child_process');
const dirExists = (p) => fsp.stat(p).then((s) => s.isDirectory()).catch(() => false);
const fileExists = (p) => fsp.access(p).then(() => true, () => false);
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const run = (bin, args) => new Promise((resolve) => {
  const c = spawn(bin, args, { stdio: 'ignore', detached: process.platform === 'linux' });
  c.on('error', () => resolve(false));
  c.on('exit', (code) => resolve(code === 0));
  if (process.platform === 'linux') c.unref();
});

async function binOnPath(name) {
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (d && await fileExists(path.join(d, name))) return true;
  }
  return false;
}

// macOS: a .command file runs in the user's default shell (right PATH,
// zero automation permissions) inside any terminal app that accepts it.
async function launchCommandFile(appPath, cwd, program) {
  const file = path.join(os.tmpdir(), `thoughtdag-resume-${Date.now()}.command`);
  try {
    await fsp.writeFile(file, `#!/bin/zsh\nrm -- ${shq(file)}\ncd ${shq(cwd)}\n${program}\n`, { mode: 0o755 });
  } catch { return false; }
  return run('open', ['-a', appPath, file]);
}
const launchOpenArgs = (appPath, argv) => run('open', ['-na', appPath, '--args', ...argv]);
const posix = (cwd, program) => ['-lc', `cd ${shq(cwd)} && ${program}`];

function buildTerminalRegistry() {
  if (process.platform === 'darwin') {
    const appEntry = (id, name, appPath, launch) => ({ id, name, probe: () => dirExists(appPath), launch });
    return [
      appEntry('terminal', 'Terminal', '/System/Applications/Utilities/Terminal.app', (cwd, p) => launchCommandFile('/System/Applications/Utilities/Terminal.app', cwd, p)),
      appEntry('iterm', 'iTerm2', '/Applications/iTerm.app', (cwd, p) => launchCommandFile('/Applications/iTerm.app', cwd, p)),
      appEntry('ghostty', 'Ghostty', '/Applications/Ghostty.app', (cwd, p) => launchOpenArgs('/Applications/Ghostty.app', ['-e', 'zsh', ...posix(cwd, p)])),
      appEntry('warp', 'Warp', '/Applications/Warp.app', (cwd, p) => launchCommandFile('/Applications/Warp.app', cwd, p)),
      appEntry('alacritty', 'Alacritty', '/Applications/Alacritty.app', (cwd, p) => launchOpenArgs('/Applications/Alacritty.app', ['-e', 'zsh', ...posix(cwd, p)])),
      appEntry('kitty', 'kitty', '/Applications/kitty.app', (cwd, p) => launchOpenArgs('/Applications/kitty.app', ['zsh', ...posix(cwd, p)])),
      appEntry('wezterm', 'WezTerm', '/Applications/WezTerm.app', (cwd, p) => launchOpenArgs('/Applications/WezTerm.app', ['start', '--', 'zsh', ...posix(cwd, p)])),
      // user-picked terminal apps ride the .command road — the one macOS
      // mechanism that needs nothing from the app but "opens shell scripts"
      ...atlasPrefs.customTerminals.map((c) => ({
        id: c.id, name: c.name, custom: true,
        probe: () => dirExists(c.app),
        launch: (cwd, p) => launchCommandFile(c.app, cwd, p),
      })),
    ];
  }
  if (process.platform === 'win32') {
    const wtPath = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'wt.exe');
    return [
      { id: 'wt', name: 'Windows Terminal', probe: async () => (await fileExists(wtPath)) || binOnPath('wt.exe'),
        launch: (cwd, p) => run('wt.exe', ['-d', cwd, 'cmd', '/k', p]) },
      { id: 'powershell', name: 'PowerShell', probe: async () => true,
        launch: (cwd, p) => run('cmd', ['/c', 'start', '', 'powershell', '-NoExit', '-Command', `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${p}`]) },
      { id: 'cmd', name: 'Command Prompt', probe: async () => true,
        launch: (cwd, p) => run('cmd', ['/c', 'start', '', 'cmd', '/k', `cd /d "${cwd}" && ${p}`]) },
    ];
  }
  // linux: binaries on PATH, each with its documented cwd/exec flags
  const bin = (id, name, argv) => ({ id, name, probe: () => binOnPath(id), launch: (cwd, p) => run(id, argv(cwd, p)) });
  return [
    bin('gnome-terminal', 'GNOME Terminal', (cwd, p) => ['--working-directory', cwd, '--', 'bash', ...posix(cwd, p)]),
    bin('konsole', 'Konsole', (cwd, p) => ['--workdir', cwd, '-e', 'bash', ...posix(cwd, p)]),
    bin('xfce4-terminal', 'Xfce Terminal', (cwd, p) => [`--working-directory=${cwd}`, '-x', 'bash', ...posix(cwd, p)]),
    bin('ghostty', 'Ghostty', (cwd, p) => ['-e', 'bash', ...posix(cwd, p)]),
    bin('alacritty', 'Alacritty', (cwd, p) => ['--working-directory', cwd, '-e', 'bash', ...posix(cwd, p)]),
    bin('kitty', 'kitty', (cwd, p) => ['--directory', cwd, 'bash', ...posix(cwd, p)]),
    bin('wezterm', 'WezTerm', (cwd, p) => ['start', '--cwd', cwd, '--', 'bash', ...posix(cwd, p)]),
    bin('x-terminal-emulator', 'System terminal', (cwd, p) => ['-e', `bash -lc ${shq(`cd ${shq(cwd)} && ${p}`)}`]),
  ];
}

const APP_TARGETS = {
  codex: { app: '/Applications/ChatGPT.app', scheme: 'codex://', name: 'ChatGPT (Codex)' },
  'claude-code': { app: '/Applications/Claude.app', scheme: 'claude://', name: 'Claude' },
};
let atlasPrefs = { terminal: 'terminal', customTerminals: [] };
const prefsFile = () => path.join(app.getPath('userData'), 'atlas-prefs.json');

function setupSessionAtlas() {
  void loadCustomRoots();
  void fsp.readFile(prefsFile(), 'utf8').then((s) => {
    const p = JSON.parse(s);
    atlasPrefs = {
      terminal: typeof p.terminal === 'string' ? p.terminal : 'terminal',
      customTerminals: Array.isArray(p.customTerminals)
        ? p.customTerminals.filter((c) => c && typeof c.id === 'string' && typeof c.app === 'string' && typeof c.name === 'string')
        : [],
    };
  }).catch(() => {});
  const savePrefs = () => fsp.writeFile(prefsFile(), JSON.stringify(atlasPrefs, null, 2)).catch(() => {});
  const probedTerminals = async () => {
    const reg = buildTerminalRegistry();
    const alive = await Promise.all(reg.map(async (t) => (await t.probe()) ? t : null));
    return alive.filter(Boolean);
  };

  ipcMain.handle('sessions:open-targets', async () => ({
    terminals: (await probedTerminals()).map((t) => ({ id: t.id, name: t.name, custom: !!t.custom })),
    apps: (await Promise.all(Object.entries(APP_TARGETS).map(async ([runner, a]) => (await dirExists(a.app)) ? { runner, name: a.name } : null))).filter(Boolean),
    prefs: { terminal: atlasPrefs.terminal },
    canAddCustom: process.platform === 'darwin',
  }));

  ipcMain.handle('sessions:set-open-prefs', async (_e, p) => {
    if (p && typeof p === 'object' && typeof p.terminal === 'string' && buildTerminalRegistry().some((t) => t.id === p.terminal)) {
      atlasPrefs.terminal = p.terminal;
      await savePrefs();
    }
    return { terminal: atlasPrefs.terminal };
  });

  // "pick another terminal app": the native picker again — the page never
  // names an app path. The chosen app rides the .command road.
  ipcMain.handle('sessions:add-terminal', async () => {
    if (process.platform !== 'darwin') return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openApplication'],
      defaultPath: '/Applications',
      filters: [{ name: 'Applications', extensions: ['app'] }],
    });
    const p = r.canceled ? null : r.filePaths[0];
    if (!p || !p.endsWith('.app')) return null;
    const dup = atlasPrefs.customTerminals.find((c) => c.app === p);
    const entry = dup ?? { id: `custom-term-${Date.now().toString(36)}`, name: path.basename(p, '.app'), app: p };
    if (!dup) atlasPrefs.customTerminals.push(entry);
    atlasPrefs.terminal = entry.id;
    await savePrefs();
    return { id: entry.id, name: entry.name };
  });

  ipcMain.handle('sessions:roots', async () => {
    const out = [];
    for (const [key, p] of Object.entries(allRoots())) {
      const exists = await fsp.stat(p).then((s) => s.isDirectory()).catch(() => false);
      out.push({ key, path: p, builtin: key in BUILTIN_ROOTS, exists });
    }
    return out;
  });

  ipcMain.handle('sessions:add-root', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    const p = r.canceled ? null : r.filePaths[0];
    if (!p) return null;
    const existing = Object.entries(allRoots()).find(([, v]) => v === p);
    if (existing) return { key: existing[0], path: p, builtin: existing[0] in BUILTIN_ROOTS, exists: true };
    const key = `custom-${Date.now().toString(36)}`;
    customRoots[key] = p;
    await fsp.writeFile(rootsFile(), JSON.stringify(customRoots, null, 2));
    return { key, path: p, builtin: false, exists: true };
  });

  ipcMain.handle('sessions:remove-root', async (_e, key) => {
    if (key in customRoots) {
      delete customRoots[key];
      await fsp.writeFile(rootsFile(), JSON.stringify(customRoots, null, 2));
    }
  });

  ipcMain.handle('sessions:list', async (_e, rootKey) => {
    const root = allRoots()[rootKey];
    if (!root) return [];
    const out = [];
    async function walk(dir, depth) {
      if (depth > 4) return; // codex nests YYYY/MM/DD; nothing legit goes deeper
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(p, depth + 1);
        else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
          try {
            const st = await fsp.stat(p);
            out.push({ rel: path.relative(root, p), size: st.size, mtime: st.mtimeMs });
          } catch { /* raced deletion — a live store is allowed to move under us */ }
        }
      }
    }
    await walk(root, 0);
    return out;
  });

  ipcMain.handle('sessions:head', async (_e, rootKey, rel, bytes) => {
    const fh = await fsp.open(resolveInRoot(rootKey, rel), 'r');
    try {
      // upper bound generous on purpose: a codex session_meta line carries
      // the full instructions blob and can exceed 48KB on its own
      const n = Math.min(Math.max(1024, bytes | 0), 524288);
      const buf = Buffer.alloc(n);
      const { bytesRead } = await fh.read(buf, 0, n, 0);
      return buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await fh.close();
    }
  });

  ipcMain.handle('sessions:read', (_e, rootKey, rel) => fsp.readFile(resolveInRoot(rootKey, rel), 'utf8'));

  // Chunked read for sessions beyond what one V8 string can hold (a 619MB
  // rollout is a real file on this machine). Chunks cut on line boundaries
  // so every returned piece parses cleanly; a single line longer than the
  // chunk (never observed — the worst line seen is 49KB) is dropped whole
  // rather than split into two corrupt halves.
  ipcMain.handle('sessions:read-range', async (_e, rootKey, rel, start, length) => {
    const fh = await fsp.open(resolveInRoot(rootKey, rel), 'r');
    try {
      const st = await fh.stat();
      const from = Math.max(0, Number(start) || 0);
      const want = Math.min(Math.max(65536, Number(length) || 0), 32 * 1024 * 1024);
      const size = Math.min(want, Math.max(0, st.size - from));
      if (size === 0) return { text: '', nextStart: from, eof: true };
      const buf = Buffer.alloc(size);
      const { bytesRead } = await fh.read(buf, 0, size, from);
      let slice = buf.subarray(0, bytesRead);
      const eof = from + bytesRead >= st.size;
      if (!eof) {
        const lastNl = slice.lastIndexOf(0x0a);
        if (lastNl >= 0) slice = slice.subarray(0, lastNl + 1);
        else return { text: '', nextStart: from + bytesRead, eof: false };
      }
      return { text: slice.toString('utf8'), nextStart: from + slice.length, eof };
    } finally {
      await fh.close();
    }
  });

  // ─── The listener: the stores announce their own changes ───────────
  // One recursive fs.watch per live root; .jsonl events debounce per file
  // and reach the page as {rootKey, rel}. Observation only — the mirror
  // decides what (if anything) to do with each event.
  const watchers = [];
  const pending = new Map(); // rootKey:rel → timer
  ipcMain.handle('sessions:watch-start', async () => {
    if (watchers.length) return true;
    const fs = require('fs');
    for (const [rootKey, root] of Object.entries(allRoots())) {
      if (!await dirExists(root)) continue;
      try {
        const w = fs.watch(root, { recursive: true }, (_event, filename) => {
          if (!filename || !String(filename).endsWith('.jsonl')) return;
          const key = `${rootKey}:${filename}`;
          clearTimeout(pending.get(key));
          pending.set(key, setTimeout(() => {
            pending.delete(key);
            if (win && !win.isDestroyed()) win.webContents.send('sessions:changed', { rootKey, rel: String(filename) });
          }, 400));
        });
        watchers.push(w);
      } catch { /* a root that refuses to be watched simply stays quiet */ }
    }
    return watchers.length > 0;
  });

  // "Open in CLI": navigation, not orchestration — this walks the user to
  // the session's door; the runner and every keystroke after are theirs.
  // Structured args only (never a raw command string from the renderer);
  // the command is assembled HERE against a runner whitelist.
  const PROGRAMS = {
    'claude-code': (id) => `claude --resume ${shq(id)}`,
    codex: (id) => `codex resume ${shq(id)}`,
  };
  // mode is the user's explicit per-click choice ('app' | 'terminal') —
  // no stored preference decides between the two roads.
  ipcMain.handle('sessions:open-in-cli', async (_e, runner, cwd, sessionId, mode) => {
    const buildProgram = PROGRAMS[runner];
    if (!buildProgram || !/^[\w.-]{4,}$/.test(String(sessionId))) return { opened: false, via: '', command: '' };
    const cwdOk = typeof cwd === 'string' && path.isAbsolute(cwd) && await dirExists(cwd);
    const dir = cwdOk ? cwd : os.homedir();
    const program = buildProgram(sessionId);
    const command = `cd ${shq(dir)} && ${program}`; // the clipboard form

    if (mode === 'app') {
      const appTarget = APP_TARGETS[runner];
      if (appTarget && await dirExists(appTarget.app)) {
        try {
          await shell.openExternal(appTarget.scheme);
          return { opened: true, via: 'app', command };
        } catch { /* fall through to the clipboard road */ }
      }
      return { opened: false, via: '', command };
    }

    // the chosen terminal first, then any other live one — a launch that
    // fails hands the command to the clipboard road, never a broken window
    const alive = await probedTerminals();
    const ordered = [...alive.filter((t) => t.id === atlasPrefs.terminal), ...alive.filter((t) => t.id !== atlasPrefs.terminal)];
    for (const term of ordered.slice(0, 2)) {
      if (await term.launch(dir, program)) return { opened: true, via: 'terminal', command };
    }
    return { opened: false, via: '', command };
  });
}

// Signed builds self-update through GitHub releases (latest*.yml), and every
// step past LOOKING belongs to the user: the app only checks quietly. Finding
// a version raises an in-app toast (the PAGE renders all update prompts via
// the preload bridge — same look and language as the rest of the UI); nothing
// downloads until the user clicks download; nothing installs until the user
// clicks restart (or quits after opting in). Checking BY HAND always answers
// out loud: found, already latest, or could not check.
let updater = null;        // electron-updater instance once set up
let announced = null;      // version already toasted this session (auto checks)
let downloading = false;
let downloadedInfo = null; // set once an update finished downloading
let manualCheck = false;   // the current check came from the menu
let lastPercent = 0;       // download progress, for the Dock bar and answers

// every update prompt is one event to the page; the page toasts it
function sendUpdate(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update:event', payload);
}

function setupAutoUpdate() {
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { return; }
  updater.autoDownload = false; // the user starts the download, never the app
  updater.on('update-available', (info) => {
    const manual = manualCheck; manualCheck = false;
    if (downloading || downloadedInfo) return;
    if (!manual && info.version === announced) return; // once per session, unless asked
    announced = info.version;
    sendUpdate({ kind: 'available', version: info.version });
  });
  updater.on('update-not-available', () => {
    const manual = manualCheck; manualCheck = false;
    if (manual) sendUpdate({ kind: 'latest', version: app.getVersion() });
  });
  // Download progress lives on the Dock icon (system-level, zero UI):
  // a 140MB first-time update on a slow line is minutes of otherwise
  // invisible work — the one moment users concluded "nothing happened".
  updater.on('download-progress', (p) => {
    lastPercent = p.percent;
    if (win && !win.isDestroyed()) win.setProgressBar(p.percent / 100);
  });
  updater.on('update-downloaded', (info) => {
    downloading = false;
    downloadedInfo = info;
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
    sendUpdate({ kind: 'ready', version: info.version });
  });
  const check = (manual) => {
    manualCheck = manual;
    updater.checkForUpdates().catch(() => {
      const m = manualCheck; manualCheck = false;
      if (m) sendUpdate({ kind: 'check-failed' });
    });
  };
  check(false);
  setInterval(() => check(false), 4 * 60 * 60 * 1000);

  // Menu → Check for updates. A downloaded update short-circuits straight
  // to the restart toast; asking during a download answers with progress;
  // asking by hand re-offers a version dismissed earlier.
  ipcMain.handle('update:check', () => {
    if (downloadedInfo) { sendUpdate({ kind: 'ready', version: downloadedInfo.version }); return; }
    if (downloading) { sendUpdate({ kind: 'downloading', percent: Math.round(lastPercent) }); return; }
    check(true);
  });
  ipcMain.handle('update:download', () => {
    if (downloading || downloadedInfo || !announced) return;
    downloading = true;
    sendUpdate({ kind: 'downloading', percent: 0 });
    updater.downloadUpdate().catch(() => {
      downloading = false;
      if (win && !win.isDestroyed()) win.setProgressBar(-1);
      sendUpdate({ kind: 'download-failed' });
    });
  });
  ipcMain.handle('update:install', () => {
    if (downloadedInfo) updater.quitAndInstall();
  });
}

// ─── One-command handoff installer ───────────────────────────────
// The /thoughtdag (Claude Code) and $thoughtdag (Codex) commands are
// shipped INSIDE the app (payload/commands in a packaged build, the
// protocol/ tree in dev). Install copies one readable text file into
// the agent's own commands directory — the only two paths this door
// can ever write — after the renderer has shown the user exactly
// where. Content comparison drives the status: never a silent
// overwrite, removal is just deleting the file.
const fsSync = require('fs');
const COMMAND_ASSETS = {
  'claude-code': {
    srcs: [path.join(ROOT, 'commands', 'claude-code-thoughtdag.md'), path.join(ROOT, 'protocol', 'adapters', 'claude-code', 'thoughtdag.md')],
    dest: path.join(os.homedir(), '.claude', 'commands', 'thoughtdag.md'),
    invoke: '/thoughtdag',
  },
  codex: {
    srcs: [path.join(ROOT, 'commands', 'codex-thoughtdag-SKILL.md'), path.join(ROOT, 'protocol', 'adapters', 'codex', 'skills', 'thoughtdag', 'SKILL.md')],
    dest: path.join(os.homedir(), '.codex', 'skills', 'thoughtdag', 'SKILL.md'),
    invoke: '$thoughtdag',
  },
};
const commandSource = (asset) => {
  for (const p2 of asset.srcs) {
    try { return fsSync.readFileSync(p2, 'utf8'); } catch { /* next */ }
  }
  return null;
};
ipcMain.handle('commands:status', () => {
  const out = {};
  for (const [runner, asset] of Object.entries(COMMAND_ASSETS)) {
    const src = commandSource(asset);
    let state = 'unavailable';
    if (src) {
      try {
        const cur = fsSync.readFileSync(asset.dest, 'utf8');
        state = cur === src ? 'installed' : 'outdated';
      } catch { state = 'absent'; }
    }
    out[runner] = { state, dest: asset.dest, invoke: asset.invoke };
  }
  return out;
});
ipcMain.handle('commands:install', (_e, runner) => {
  const asset = COMMAND_ASSETS[runner];
  if (!asset) return { ok: false };
  const src = commandSource(asset);
  if (!src) return { ok: false };
  try {
    fsSync.mkdirSync(path.dirname(asset.dest), { recursive: true });
    fsSync.writeFileSync(asset.dest, src, 'utf8');
    return { ok: true, dest: asset.dest };
  } catch (e) { return { ok: false, error: String(e) }; }
});
ipcMain.handle('commands:remove', (_e, runner) => {
  const asset = COMMAND_ASSETS[runner];
  if (!asset) return { ok: false };
  try { fsSync.unlinkSync(asset.dest); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; }
});

// ─── Codex app-server (Tier 2, READ path) ────────────────────────
// Lazy singleton over `codex app-server` (JSON-RPC over stdio): the
// thread store's front door — real names, fork lineage, paged turns.
// File mirroring (Tier 1) stays the import truth; this layer only
// reads. No codex CLI → every call answers null, the UI stays Tier 1.
let codexRpc = null; // null=not started, 'dead'=CLI absent, else client
function codexAppServer() {
  if (codexRpc === 'dead') return null;
  if (codexRpc) return codexRpc;
  try {
    const proc = require('child_process').spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    const pending = new Map();
    let nextId = 1;
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        } catch { /* notification noise */ }
      }
    });
    proc.on('error', () => { codexRpc = 'dead'; });
    proc.on('exit', () => { if (codexRpc !== 'dead') codexRpc = null; });
    const send = (method, params) => new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); } catch { resolve(null); }
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(null); } }, 10000);
    });
    codexRpc = { send, proc, ready: send('initialize', { clientInfo: { name: 'thoughtdag', title: 'ThoughtDAG', version: app.getVersion() } }) };
    return codexRpc;
  } catch { codexRpc = 'dead'; return null; }
}
ipcMain.handle('codex:threads', async () => {
  const c = codexAppServer();
  if (!c) return null;
  await c.ready;
  const r = await c.send('thread/list', { limit: 200 });
  const data = r?.result?.data;
  if (!Array.isArray(data)) return null;
  return data.map((t) => ({
    id: t.id, sessionId: t.sessionId, name: t.name ?? null,
    preview: String(t.preview ?? '').slice(0, 200),
    forkedFromId: t.forkedFromId ?? null, parentThreadId: t.parentThreadId ?? null,
    updatedAt: t.updatedAt ?? null, cwd: t.cwd ?? null, path: t.path ?? null,
  }));
});
ipcMain.handle('codex:thread-read', async (_e, threadId) => {
  if (typeof threadId !== 'string' || !/^[A-Za-z0-9-]{8,}$/.test(threadId)) return null;
  const c = codexAppServer();
  if (!c) return null;
  await c.ready;
  const r = await c.send('thread/read', { threadId, includeTurns: true });
  return r?.result?.thread ?? null;
});

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  // Deep link: thoughtdag://open?session=<id> — the /thoughtdag
  // command's front door. The packaged app registers via the builder
  // protocols block; dev shells register the electron binary so the
  // loop is testable before release. macOS delivers via open-url;
  // win/linux via argv (cold start) or second-instance (running).
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('thoughtdag', process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient('thoughtdag');
  }
  let pendingDeepLink = process.argv.find((a) => typeof a === 'string' && a.startsWith('thoughtdag://')) ?? null;
  const deliverDeepLink = (url) => {
    if (typeof url !== 'string' || !url.startsWith('thoughtdag://')) return;
    if (win && !win.isDestroyed()) {
      win.webContents.send('sessions:deeplink', url);
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      pendingDeepLink = url; // the renderer pulls it once it is ready
    }
  };
  app.on('open-url', (e, url) => { e.preventDefault(); deliverDeepLink(url); });
  ipcMain.handle('sessions:pending-deeplink', () => { const l = pendingDeepLink; pendingDeepLink = null; return l; });
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const link = argv.find((a) => typeof a === 'string' && a.startsWith('thoughtdag://'));
    if (link) deliverDeepLink(link);
  });
  app.whenReady().then(() => {
    void boot();
    setupSessionAtlas();
    if (app.isPackaged) {
      setupAutoUpdate();
    } else {
      // dev shell: the menu entry exists (preload is loaded), so answer honestly
      ipcMain.handle('update:check', () => { sendUpdate({ kind: 'dev' }); });
    }
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { serverProc?.kill(); if (codexRpc && codexRpc !== 'dead') codexRpc.proc.kill(); });
}
