// ThoughtDAG desktop shell — a thin window around the SAME app:
// the bundled server.mjs runs as a child, serves the built dist on a
// local port, and this window points at it. No second stack: everything
// the web app is, the desktop app is.
const { app, BrowserWindow, shell, utilityProcess, ipcMain } = require('electron');
const path = require('path');
const net = require('net');

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
    env: { ...process.env, PORT: String(port), SERVE_DIST: path.join(ROOT, 'dist') },
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
