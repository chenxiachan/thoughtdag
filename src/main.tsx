import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import App from './App'
import { bootProjects } from './store/projects'
import { isViewerMode, bootViewer } from './lib/viewer'
import { initAppearance } from './lib/appearance'
import { installDshSessionsBridge } from './lib/atlas/dsh-bridge'

// Theme attributes land on <html> before first paint — no wrong-theme flash
initAppearance()

// Embedded in DeepSeek Harness (the dsh-thoughtdag plugin builds with this
// set): the harness's own web server is the session bridge, so the atlas
// and the live mirror light up exactly as they do in the desktop shell.
const dshApi = import.meta.env.VITE_DSH_BRIDGE as string | undefined
if (dshApi && !window.desktopSessions) installDshSessionsBridge(dshApi)

// Resolve the active project and rehydrate the store before/while React
// mounts — App's hydration gate opens when this finishes. A #view= link
// boots read-only instead: graph from the URL, persistence silenced.
if (isViewerMode) void bootViewer()
else {
  void bootProjects()
  // Ask the browser to mark this origin's storage persistent — exempts the
  // IndexedDB canvases from best-effort eviction under disk pressure.
  // Browsers grant it silently based on engagement; a refusal is harmless.
  if (navigator.storage?.persist) void navigator.storage.persist()
  void import('./lib/local-backup').then((m) => m.bootAutoBackup())
}

// A long-lived tab keeps running the bundle it loaded; nudge when a newer
// deploy lands (viewer tabs included — a shared link can sit open for days).
void import('./lib/update-check').then((m) => m.bootUpdateCheck())

// Pasting a #view= link into an ALREADY-OPEN tab only changes the hash —
// the browser won't reload, so the viewer/author decision above never
// re-runs. Cross the boundary with an explicit reload (both directions).
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#view=') !== isViewerMode) window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
