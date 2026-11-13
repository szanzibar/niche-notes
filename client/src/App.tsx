import { useEffect, useState } from 'react'
import { BrowserRouter, useMatch } from 'react-router-dom'
import { NoteView } from './components/NoteView'
import { Tree } from './components/Tree'
import { registerAlerts } from './lib/alerts'
import { api } from './lib/api'
import type { User } from './lib/types'

interface Session {
  user: User
  token: string
}
import { useY } from './sync/hooks'
import { start } from './sync/store'
import { purgeExpired, settings } from './sync/tree'

export default function App() {
  const [me, setMe] = useState<User | null>(null)

  useEffect(() => {
    document.documentElement.dataset.density = localStorage.getItem('density') ?? ''
    const cached = localStorage.getItem('session')
    const draw = ({ user, token }: Session) =>
      start(user, token).then(() => {
        setMe(user)
        void purgeExpired()
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
  const prefs = settings()
  useY(prefs)
  const accent = prefs.get('accent') as string | undefined
  const theme = prefs.get('theme') as string | undefined
  useEffect(() => {
    if (accent) document.documentElement.style.setProperty('--accent', accent)
    else document.documentElement.style.removeProperty('--accent')
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [accent, theme])
  return (
    <div className="h-dvh md:grid md:grid-cols-[320px_1fr]">
      <aside
        className={`${noteId ? 'hidden md:flex' : 'flex'} h-full flex-col overflow-hidden border-border bg-surface md:border-r-2`}
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
