import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import App from './App'
import { bootProjects } from './store/projects'
import { isViewerMode, bootViewer } from './lib/viewer'

// Resolve the active project and rehydrate the store before/while React
// mounts — App's hydration gate opens when this finishes. A #view= link
// boots read-only instead: graph from the URL, persistence silenced.
if (isViewerMode) void bootViewer()
else void bootProjects()

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
