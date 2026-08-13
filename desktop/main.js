// ThoughtDAG desktop shell — a thin window around the SAME app:
// the bundled server.mjs runs as a child, serves the built dist on a
// local port, and this window points at it. No second stack: everything
// the web app is, the desktop app is.
const { app, BrowserWindow, shell, utilityProcess } = require('electron');
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
// "Later" stays quiet for the rest of the session and asks once next launch.
function setupAutoUpdate() {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  const { dialog } = require('electron');
  const zh = app.getLocale().startsWith('zh');
  autoUpdater.autoDownload = false; // the user starts the download, never the app
  let skippedVersion = null;
  let downloading = false;
  autoUpdater.on('update-available', (info) => {
    if (downloading || info.version === skippedVersion) return;
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
        autoUpdater.downloadUpdate().catch(() => { downloading = false; });
      } else {
        skippedVersion = info.version;
      }
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
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
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
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
    if (app.isPackaged) setupAutoUpdate();
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) boot(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { serverProc?.kill(); });
}
