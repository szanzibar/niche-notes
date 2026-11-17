import { useEffect, useState } from 'react'
import { BrowserRouter, useMatch, useNavigate } from 'react-router-dom'
import { NoteView } from './components/NoteView'
import { appTheme } from './components/themes'
import { Tree } from './components/Tree'
import { registerAlerts } from './lib/alerts'
import { api } from './lib/api'
import type { User } from './lib/types'

interface Session {
  user: User
  token: string
}

declare global {
  interface Window {
    launchQueue?: { setConsumer(consumer: (params: { targetURL?: string }) => void): void }
  }
}
import { useY } from './sync/hooks'
import { start, synced } from './sync/store'
import { nodes, purgeExpired, settings } from './sync/tree'

export default function App() {
  const [me, setMe] = useState<User | null>(null)

  useEffect(() => {
    document.documentElement.dataset.density = localStorage.getItem('density') ?? ''
    const cached = localStorage.getItem('session')
    const draw = ({ user, token }: Session) =>
      start(user, token).then(() => {
        setMe(user)
        // The sweep trusts each note's copy only once this launch has caught up with the server.
        void synced.then(purgeExpired)
      })
    // Draw the last signed-in user's local data first, so a launch never waits on the network.
    if (cached) void draw(JSON.parse(cached) as Session)
    api
      .me()
      .then((session) => {
        localStorage.setItem('session', JSON.stringify(session))
        registerAlerts().catch(() => {})
        if (!cached) return draw(session)
        // Someone else signed in on this browser.
        if (session.user.id !== (JSON.parse(cached) as Session).user.id) window.location.reload()
        else void start(session.user, session.token)
      })
      .catch(() => {})
  }, [])

  if (!me) return null
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}

function Shell() {
  const noteId = useMatch('/n/:id')?.params.id
  const navigate = useNavigate()
  // A link from a widget, a calendar event or an alert, arriving while the app runs, opens like a tap in the app
  // instead of loading a page over it. So a note always sits right over the list, and back from the list leaves.
  useEffect(() => {
    const open = (link: string) => {
      const url = new URL(link, location.origin)
      const n = url.searchParams.get('n')
      url.searchParams.delete('n')
      // A widget names its note as /?n=<id>, so Chrome hands it to this page instead of loading a new one.
      const pathname = n ? `/n/${n}` : url.pathname
      const search = url.search
      // A note's share link signs in on the server.
      if (pathname.startsWith('/s/')) return location.assign(link)
      const onNote = location.pathname.startsWith('/n/')
      if (pathname.startsWith('/n/')) return navigate(pathname + search, { replace: onNote })
      // Anything else, such as the widget picker, takes the list's place, so an open note closes first.
      if (!onNote) return navigate(pathname + search, { replace: true })
      addEventListener('popstate', () => navigate(pathname + search, { replace: true }), { once: true })
      navigate(-1)
    }
    window.launchQueue?.setConsumer(({ targetURL }) => targetURL && open(targetURL))
    const message = ({ data }: MessageEvent<{ open?: string }>) => data.open && open(data.open)
    navigator.serviceWorker?.addEventListener('message', message)
    return () => navigator.serviceWorker?.removeEventListener('message', message)
  }, [navigate])
  const prefs = settings()
  useY(prefs)
  useY(nodes())
  const theme = prefs.get('theme') as string | undefined
  const { color, text } = appTheme(noteId)
  // The notes opened on this device, the last one first, for the tree's Recent list.
  useEffect(() => {
    if (!noteId) return
    const recent = JSON.parse(localStorage.getItem('recent') ?? '[]') as string[]
    localStorage.setItem('recent', JSON.stringify([noteId, ...recent.filter((id) => id !== noteId)].slice(0, 50)))
  }, [noteId])
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', color)
    document.documentElement.style.setProperty('--on-accent', text)
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [color, text, theme])
  return (
    <div className="h-dvh md:grid md:grid-cols-[320px_1fr]">
      <aside
        className={`${noteId ? 'hidden md:flex' : 'flex'} h-full flex-col overflow-hidden border-border bg-tint md:border-r-2`}
      >
        <Tree selected={noteId} />
      </aside>
      <main className={`${noteId ? 'flex' : 'hidden md:flex'} h-full flex-col overflow-hidden`}>
        {noteId ? (
          <NoteView key={noteId} id={noteId} />
        ) : (
          <p className="m-auto text-ink-muted">Pick a note, or make a new one.</p>
        )}
      </main>
    </div>
  )
}
