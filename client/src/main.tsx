import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// A launch straight into a note, as from a widget, puts the list under it, so back goes to the list.
if (location.pathname.startsWith('/n/') && history.state == null) {
  const note = location.pathname
  history.replaceState(null, '', '/')
  history.pushState(null, '', note)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
