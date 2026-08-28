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
  list: (rootKey) => ipcRenderer.invoke('sessions:list', rootKey),
  head: (rootKey, rel, bytes) => ipcRenderer.invoke('sessions:head', rootKey, rel, bytes),
  read: (rootKey, rel) => ipcRenderer.invoke('sessions:read', rootKey, rel),
  openInCli: (runner, cwd, sessionId) => ipcRenderer.invoke('sessions:open-in-cli', runner, cwd, sessionId),
});
