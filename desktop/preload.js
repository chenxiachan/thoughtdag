// The one bridge between the web layer and the desktop shell. The page
// stays a normal web app (no node integration); anything the shell can do
// for it is declared here, explicitly, one method at a time.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Manual "check for updates": the main process runs the check and owns
  // every dialog that follows (found / latest / offline).
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
});
