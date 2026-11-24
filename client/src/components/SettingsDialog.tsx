import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { alertState, turnOffAlerts, turnOnAlerts } from '../lib/alerts'
import { api } from '../lib/api'
import { useStore, useY } from '../sync/hooks'
import { wipeLocal } from '../sync/store'
import { settings } from '../sync/tree'
import { Button, IconButton } from './Button'
import { CloseIcon, SettingsIcon } from './icons'
import { Info } from './Popover'
import { THEMES } from './themes'

const APPEARANCES: [string, string | undefined][] = [
  ['Follow device', undefined],
  ['Light', 'light'],
  ['Dark', 'dark'],
]

const SCHEMES: [string, string | undefined][] = [
  ['Default', undefined],
  ['Confetti', 'confetti'],
]

const DENSITIES: [string, string | undefined][] = [
  ['Compact', 'compact'],
  ['Default', undefined],
  ['Large', 'large'],
]

export function SettingsDialog() {
  // The Android and desktop apps say which build they are. A build without a number is a local one.
  const app = (window as { nicheNotesApp?: { version: number } }).nicheNotesApp
  const s = useStore()
  const prefs = settings()
  useY(prefs)
  const accent = (prefs.get('accent') as string | undefined) ?? THEMES[0].color
  const theme = prefs.get('theme') as string | undefined
  const scheme = prefs.get('scheme') as string | undefined
  // Density stays on this device, since a phone and a desktop want different sizes.
  const [density, setDensity] = useState(localStorage.getItem('density') ?? undefined)
  const chooseDensity = (value: string | undefined) => {
    if (value) localStorage.setItem('density', value)
    else localStorage.removeItem('density')
    setDensity(value)
  }
  useEffect(() => {
    document.documentElement.dataset.density = density ?? ''
  }, [density])
  // The Google account whose calendar holds the dated lines, or null before Settings hears from the server.
  const [google, setGoogle] = useState<{ email: string | null } | null>(null)
  const [alerts, setAlerts] = useState(alertState)
  const open = (opened: boolean) => {
    if (!opened) return
    setAlerts(alertState())
    api
      .googleCalendar()
      .then(setGoogle)
      .catch(() => {})
  }

  const signOut = async () => {
    await api.logout()
    await wipeLocal()
    // The app starts again signed out and goes to the login from there. A login that opens in another window,
    // as the desktop app's does, would leave the notes on this page.
    window.location.reload()
  }

  return (
    <Dialog.Root onOpenChange={open}>
      <Dialog.Trigger asChild>
        <IconButton label="Settings">
          <SettingsIcon />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 max-h-[92dvh] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-border bg-surface p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" className="-mr-2.5">
                <CloseIcon />
              </IconButton>
            </Dialog.Close>
          </div>
          <p className="mb-2 font-medium">Appearance</p>
          <div className="flex flex-wrap gap-2">
            {APPEARANCES.map(([name, value]) => (
              <Button
                key={name}
                aria-pressed={theme === value}
                onClick={() => (value ? prefs.set('theme', value) : prefs.delete('theme'))}
              >
                {name}
              </Button>
            ))}
          </div>
          <p className="mb-2 mt-5 font-medium">Color scheme</p>
          <div className="flex flex-wrap gap-2">
            {SCHEMES.map(([name, value]) => (
              <Button
                key={name}
                aria-pressed={scheme === value}
                onClick={() => (value ? prefs.set('scheme', value) : prefs.delete('scheme'))}
              >
                {name}
              </Button>
            ))}
          </div>
          {/* Confetti gives every note its own color, so there is no theme to pick. */}
          {!scheme && (
            <>
              <p className="mb-2 mt-5 font-medium">Theme</p>
              <div className="grid grid-cols-7 gap-2">
                {THEMES.map(({ name, color }) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={name}
                    aria-pressed={color === accent}
                    title={name}
                    className={`aspect-square border-2 border-border ${color === accent ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
                    style={{ background: color }}
                    onClick={() => prefs.set('accent', color)}
                  />
                ))}
              </div>
            </>
          )}
          <p className="mb-2 mt-5 font-medium">Density</p>
          <div className="flex flex-wrap gap-2">
            {DENSITIES.map(([name, value]) => (
              <Button
                key={name}
                aria-pressed={density === value}
                onClick={() => chooseDensity(value)}
              >
                {name}
              </Button>
            ))}
          </div>
          {alerts && (
            <>
              <div className="mb-2 mt-5 flex items-center">
                <p className="font-medium">Alerts</p>
                {alerts === 'denied' && (
                  <Info label="About alerts">
                    Allow notifications for Niche Notes in your phone's settings, then close the app and open it again.
                  </Info>
                )}
              </div>
              {alerts === 'granted' && (
                <>
                  <p className="mb-2 text-sm text-ink-muted">On for this device.</p>
                  <Button onClick={() => void turnOffAlerts().then(() => setAlerts(alertState()))}>Turn off</Button>
                </>
              )}
              {(alerts === 'default' || alerts === 'off') && (
                <Button onClick={() => void turnOnAlerts().then(() => setAlerts(alertState()))}>Turn on alerts</Button>
              )}
              {alerts === 'denied' && <p className="text-sm text-ink-muted">Blocked on this device.</p>}
            </>
          )}
          <div className="mb-2 mt-5 flex items-center">
            <p className="font-medium">Calendar</p>
            <Info label="About the calendar">
              Dated tasks go to a Niche Notes calendar in your Google Calendar, a minute after each change.
              Edit them here, since changes made in Google Calendar don't come back.
            </Info>
          </div>
          {google?.email ? (
            <>
              <p className="mb-2 text-sm text-ink-muted">{google.email}</p>
              <Button onClick={() => void api.disconnectGoogleCalendar().then(() => setGoogle({ email: null }))}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              disabled={!google}
              onClick={() => {
                const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
                window.location.href = `/auth/google?${new URLSearchParams({ time_zone: timeZone })}`
              }}
            >
              Connect Google Calendar
            </Button>
          )}
          <p className="mb-2 mt-5 font-medium">Account</p>
          <p className="mb-2 text-sm text-ink-muted">{s.me!.name}</p>
          <Button onClick={() => void signOut()}>Sign out</Button>
          <p className="mb-2 mt-5 font-medium">Version</p>
          <p className="text-sm text-ink-muted">
            Server {import.meta.env.VITE_BUILD || 'dev'}
            {app && ` · App ${app.version || 'dev'}`}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
