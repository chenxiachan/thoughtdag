// The one bridge between the web layer and the desktop shell. The page
// stays a normal web app (no node integration); anything the shell can do
// for it is declared here, explicitly, one method at a time.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Update flow: the shell checks/downloads/installs, the PAGE renders every
  // prompt as in-app toasts (same look and language as the rest of the UI).
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (cb) => { ipcRenderer.on('update:event', (_e, data) => cb(data)); },
});

// Session atlas: fenced read-only primitives over the runner session
// stores (see main.js SESSION_ROOTS). Runner knowledge stays in the page.
contextBridge.exposeInMainWorld('desktopSessions', {
  roots: () => ipcRenderer.invoke('sessions:roots'),
  addRoot: () => ipcRenderer.invoke('sessions:add-root'),
  removeRoot: (key) => ipcRenderer.invoke('sessions:remove-root', key),
  list: (rootKey) => ipcRenderer.invoke('sessions:list', rootKey),
  head: (rootKey, rel, bytes) => ipcRenderer.invoke('sessions:head', rootKey, rel, bytes),
  read: (rootKey, rel) => ipcRenderer.invoke('sessions:read', rootKey, rel),
  readRange: (rootKey, rel, start, length) => ipcRenderer.invoke('sessions:read-range', rootKey, rel, start, length),
  openInCli: (runner, cwd, sessionId, mode) => ipcRenderer.invoke('sessions:open-in-cli', runner, cwd, sessionId, mode),
  openTargets: () => ipcRenderer.invoke('sessions:open-targets'),
  setOpenPrefs: (prefs) => ipcRenderer.invoke('sessions:set-open-prefs', prefs),
  addTerminal: () => ipcRenderer.invoke('sessions:add-terminal'),
  watchStart: () => ipcRenderer.invoke('sessions:watch-start'),
  onSessionsChanged: (cb) => { ipcRenderer.on('sessions:changed', (_e, data) => cb(data)); },
  onDeepLink: (cb) => { ipcRenderer.on('sessions:deeplink', (_e, url) => cb(url)); },
  codexThreads: () => ipcRenderer.invoke('codex:threads'),
  codexThreadRead: (threadId) => ipcRenderer.invoke('codex:thread-read', threadId),
  pendingDeepLink: () => ipcRenderer.invoke('sessions:pending-deeplink'),
});
