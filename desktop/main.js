// ThoughtDAG desktop shell — a thin window around the SAME app:
// the bundled server.mjs runs as a child, serves the built dist on a
// local port, and this window points at it. No second stack: everything
// the web app is, the desktop app is.
const { app, BrowserWindow, shell, utilityProcess, ipcMain, dialog } = require('electron');
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
// a version raises a dialog; nothing downloads until the user says download;
// nothing installs until the user says restart (or quits after opting in).
// "Later" stays quiet for the rest of the session and asks once next launch —
// unless the user checks BY HAND (menu → Check for updates), which always
// answers out loud: found, already latest, or offline.
const zh = app.getLocale().startsWith('zh');
let updater = null;      // electron-updater instance once set up
let skippedVersion = null;
let downloading = false;
let downloadedInfo = null; // set once an update finished downloading
let manualCheck = false;   // the current check came from the menu

function askToRestart(info) {
  void dialog.showMessageBox(win, {
    type: 'info',
    message: zh ? `ThoughtDAG ${info.version} 已就绪` : `ThoughtDAG ${info.version} is ready`,
    detail: zh
      ? '现在重启完成更新，或在你退出应用时自动完成。'
      : 'Restart now to finish the update, or it completes when you quit.',
    buttons: [zh ? '立即重启更新' : 'Restart and update', zh ? '退出时完成' : 'Finish on quit'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) updater.quitAndInstall();
  });
}

function setupAutoUpdate() {
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { return; }
  updater.autoDownload = false; // the user starts the download, never the app
  updater.on('update-available', (info) => {
    const manual = manualCheck; manualCheck = false;
    if (downloading || (!manual && info.version === skippedVersion)) return;
    void dialog.showMessageBox(win, {
      type: 'info',
      message: zh ? `发现新版本 ${info.version}` : `Version ${info.version} is available`,
      detail: zh
        ? '要现在下载吗？下载在后台进行，完成后会再询问是否重启。'
        : 'Download it now? It downloads in the background and asks again before restarting.',
      buttons: [zh ? '下载更新' : 'Download update', zh ? '稍后' : 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        downloading = true;
        updater.downloadUpdate().catch(() => { downloading = false; });
      } else {
        skippedVersion = info.version;
      }
    });
  });
  updater.on('update-not-available', () => {
    const manual = manualCheck; manualCheck = false;
    if (!manual) return;
    void dialog.showMessageBox(win, {
      type: 'info',
      message: zh ? `当前已是最新版本（${app.getVersion()}）` : `You're on the latest version (${app.getVersion()})`,
      buttons: [zh ? '好' : 'OK'],
    });
  });
  updater.on('update-downloaded', (info) => {
    downloading = false;
    downloadedInfo = info;
    askToRestart(info);
  });
  const check = () => updater.checkForUpdates().catch(() => {
    const manual = manualCheck; manualCheck = false;
    if (!manual) return;
    void dialog.showMessageBox(win, {
      type: 'warning',
      message: zh ? '无法检查更新' : 'Could not check for updates',
      detail: zh ? '请检查网络连接后重试。' : 'Check your connection and try again.',
      buttons: [zh ? '好' : 'OK'],
    });
  });
  check();
  setInterval(check, 4 * 60 * 60 * 1000);

  // Menu → Check for updates. A downloaded update short-circuits straight
  // to the restart dialog; a skipped version gets a second chance — asking
  // by hand IS the user changing their mind.
  ipcMain.handle('update:check', () => {
    if (downloadedInfo) { askToRestart(downloadedInfo); return; }
    if (downloading) return; // quiet: the ready dialog arrives on its own
    skippedVersion = null;
    manualCheck = true;
    check();
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
      ipcMain.handle('update:check', () => {
        void dialog.showMessageBox(win, { message: 'Dev build — no update channel.', buttons: ['OK'] });
      });
    }
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { serverProc?.kill(); });
}
