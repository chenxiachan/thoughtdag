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
const BUILTIN_ROOTS = {
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

// How "open in CLI" leaves the shell. Terminals are probed, never assumed;
// a runner can prefer its host APP (scheme launch) over a terminal. All of
// it macOS-first — other platforms fall back to the clipboard road.
const TERMINALS = [
  { id: 'terminal', name: 'Terminal', app: '/System/Applications/Utilities/Terminal.app', mode: 'command-file' },
  { id: 'iterm', name: 'iTerm2', app: '/Applications/iTerm.app', mode: 'command-file' },
  { id: 'ghostty', name: 'Ghostty', app: '/Applications/Ghostty.app', mode: 'exec-args' },
];
const APP_TARGETS = {
  codex: { app: '/Applications/ChatGPT.app', scheme: 'codex://', name: 'ChatGPT (Codex)' },
  'claude-code': { app: '/Applications/Claude.app', scheme: 'claude://', name: 'Claude' },
};
let atlasPrefs = { terminal: 'terminal', openApp: {} };
const prefsFile = () => path.join(app.getPath('userData'), 'atlas-prefs.json');
const dirExists = (p) => fsp.stat(p).then((s) => s.isDirectory()).catch(() => false);

function setupSessionAtlas() {
  void loadCustomRoots();
  void fsp.readFile(prefsFile(), 'utf8').then((s) => {
    const p = JSON.parse(s);
    atlasPrefs = { terminal: typeof p.terminal === 'string' ? p.terminal : 'terminal', openApp: p.openApp && typeof p.openApp === 'object' ? p.openApp : {} };
  }).catch(() => {});

  ipcMain.handle('sessions:open-targets', async () => ({
    terminals: (await Promise.all(TERMINALS.map(async (t) => (await dirExists(t.app)) ? { id: t.id, name: t.name } : null))).filter(Boolean),
    apps: (await Promise.all(Object.entries(APP_TARGETS).map(async ([runner, a]) => (await dirExists(a.app)) ? { runner, name: a.name } : null))).filter(Boolean),
    prefs: atlasPrefs,
  }));

  ipcMain.handle('sessions:set-open-prefs', async (_e, p) => {
    if (p && typeof p === 'object' && typeof p.terminal === 'string' && TERMINALS.some((t) => t.id === p.terminal)) {
      atlasPrefs.terminal = p.terminal;
      await fsp.writeFile(prefsFile(), JSON.stringify(atlasPrefs, null, 2)).catch(() => {});
    }
    return atlasPrefs;
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
      const n = Math.min(Math.max(1024, bytes | 0), 65536);
      const buf = Buffer.alloc(n);
      const { bytesRead } = await fh.read(buf, 0, n, 0);
      return buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await fh.close();
    }
  });

  ipcMain.handle('sessions:read', (_e, rootKey, rel) => fsp.readFile(resolveInRoot(rootKey, rel), 'utf8'));

  // "Open in CLI": navigation, not orchestration — this walks the user to
  // the session's door; the runner and every keystroke after are theirs.
  // Structured args only (never a raw command string from the renderer);
  // the command is assembled HERE against a runner whitelist.
  const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const RESUME = {
    'claude-code': (cwd, id) => `cd ${shq(cwd)} && claude --resume ${shq(id)}`,
    codex: (cwd, id) => `cd ${shq(cwd)} && codex resume ${shq(id)}`,
  };
  // mode is the user's explicit per-click choice ('app' | 'terminal') —
  // no stored preference decides between the two roads.
  ipcMain.handle('sessions:open-in-cli', async (_e, runner, cwd, sessionId, mode) => {
    const build = RESUME[runner];
    if (!build || !/^[\w.-]{4,}$/.test(String(sessionId))) return { opened: false, via: '', command: '' };
    const cwdOk = typeof cwd === 'string' && path.isAbsolute(cwd) && await dirExists(cwd);
    const command = build(cwdOk ? cwd : os.homedir(), sessionId);

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

    if (process.platform === 'darwin') {
      const term = (await dirExists((TERMINALS.find((t) => t.id === atlasPrefs.terminal) ?? TERMINALS[0]).app))
        ? (TERMINALS.find((t) => t.id === atlasPrefs.terminal) ?? TERMINALS[0])
        : TERMINALS[0];
      const { spawn } = require('child_process');
      const opened = await new Promise((resolve) => {
        let child;
        if (term.mode === 'exec-args') {
          // Ghostty-style: -e runs the command inside the emulator; zsh -lc
          // gives it the user's login PATH
          child = spawn('open', ['-na', term.app, '--args', '-e', 'zsh', '-lc', command], { stdio: 'ignore' });
        } else {
          // .command file: the terminal executes it in the user's own login
          // shell — right PATH (GUI apps carry a bare one), zero automation
          // permissions. Self-deletes after launching the runner.
          const file = path.join(os.tmpdir(), `thoughtdag-resume-${Date.now()}.command`);
          try {
            require('fs').writeFileSync(file, `#!/bin/zsh\nrm -- ${shq(file)}\n${command}\n`, { mode: 0o755 });
          } catch { resolve(false); return; }
          child = spawn('open', ['-a', term.app, file], { stdio: 'ignore' });
        }
        child.on('exit', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
      if (opened) return { opened: true, via: 'terminal', command };
    }
    return { opened: false, via: '', command }; // caller falls back to the clipboard
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

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
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
  app.on('will-quit', () => { serverProc?.kill(); });
}
