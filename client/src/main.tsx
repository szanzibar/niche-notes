import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// A widget names its note as /?n=<id>, so Chrome hands it to the open page instead of loading a new one.
const params = new URLSearchParams(location.search)
const n = params.get('n')
params.delete('n')
const path = n ? `/n/${n}${params.size ? `?${params}` : ''}` : location.pathname + location.search

// A launch straight into a note, as from a widget, puts the list under it, so back goes to the list.
if (path.startsWith('/n/') && history.state == null) {
  history.replaceState(null, '', '/')
  history.pushState(null, '', path)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
