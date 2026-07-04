import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import App from './App'
import { bootProjects } from './store/projects'

// Resolve the active project and rehydrate the store before/while React
// mounts — App's hydration gate opens when this finishes.
void bootProjects()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
