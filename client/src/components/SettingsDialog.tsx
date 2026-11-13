import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { enableAlerts } from '../lib/alerts'
import { api } from '../lib/api'
import { useY } from '../sync/hooks'
import { settings } from '../sync/tree'
import { Button, IconButton } from './Button'
import { SettingsIcon } from './icons'

// Dark enough for white text on a selected row, and bright enough to show against a dark background.
const ACCENTS = [
  ['Coral', '#FF4F3B'],
  ['Blue', '#2F6BFF'],
  ['Green', '#1A9E5C'],
  ['Purple', '#8B3DFF'],
  ['Orange', '#E8700A'],
  ['Pink', '#E0338A'],
  ['Teal', '#0E9494'],
]

const THEMES: [string, string | undefined][] = [
  ['Follow device', undefined],
  ['Light', 'light'],
  ['Dark', 'dark'],
]

const DENSITIES: [string, string | undefined][] = [
  ['Compact', 'compact'],
  ['Default', undefined],
  ['Large', 'large'],
]

export function SettingsDialog() {
  const prefs = settings()
  useY(prefs)
  const accent = (prefs.get('accent') as string | undefined) ?? ACCENTS[0][1]
  const theme = prefs.get('theme') as string | undefined
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
  // The calendar address is fetched when Settings opens, since a tap that opens a link can't wait for the server.
  const [calendar, setCalendar] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const google =
    calendar && `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendar.replace(/^https?:/, 'webcal:'))}`
  // Google Calendar's Android app claims Google's links and can't add a calendar from one, so a phone pastes the
  // link into a browser. Google's sign-in comes first, for a browser that isn't signed in yet.
  const android = /Android/.test(navigator.userAgent)
  const copy = android ? google && `https://accounts.google.com/ServiceLogin?service=cl&continue=${encodeURIComponent(google)}` : calendar
  const [alerts, setAlerts] = useState('Notification' in window ? Notification.permission : null)
  const open = (opened: boolean) => {
    if (!opened) return
    setAlerts('Notification' in window ? Notification.permission : null)
    api
      .calendar()
      .then(({ url }) => setCalendar(url))
      .catch(() => {})
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
          className="fixed left-1/2 top-1/2 w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 border-2 border-border bg-surface p-5 shadow-brutal"
        >
          <Dialog.Title className="mb-3 text-lg font-bold">Settings</Dialog.Title>
          <p className="mb-2 font-medium">Highlight color</p>
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {ACCENTS.map(([name, hex]) => (
              <button
                key={hex}
                type="button"
                aria-label={name}
                aria-pressed={hex === accent}
                title={name}
                className={`aspect-square border-2 border-border ${hex === accent ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
                style={{ background: hex }}
                onClick={() => prefs.set('accent', hex)}
              />
            ))}
          </div>
          <p className="mb-2 mt-5 font-medium">Appearance</p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map(([name, value]) => (
              <Button
                key={name}
                variant={theme === value ? 'primary' : 'default'}
                aria-pressed={theme === value}
                onClick={() => (value ? prefs.set('theme', value) : prefs.delete('theme'))}
              >
                {name}
              </Button>
            ))}
          </div>
          <p className="mb-2 mt-5 font-medium">Density</p>
          <div className="flex flex-wrap gap-2">
            {DENSITIES.map(([name, value]) => (
              <Button
                key={name}
                variant={density === value ? 'primary' : 'default'}
                aria-pressed={density === value}
                onClick={() => chooseDensity(value)}
              >
                {name}
              </Button>
            ))}
          </div>
          {alerts && (
            <>
              <p className="mb-2 mt-5 font-medium">Alerts</p>
              {alerts === 'granted' && <p className="text-sm text-ink-muted">On for this device.</p>}
              {alerts === 'default' && (
                <Button onClick={() => void enableAlerts().then(() => setAlerts(Notification.permission))}>
                  Turn on alerts
                </Button>
              )}
              {alerts === 'denied' && (
                <p className="text-sm text-ink-muted">
                  Blocked on this device. Allow notifications for Niche Notes in your phone's settings, then close the
                  app and open it again.
                </p>
              )}
            </>
          )}
          <p className="mt-5 font-medium">Calendar</p>
          {android ? (
            <p className="mb-2 text-sm text-ink-muted">
              Dated checkbox lines in Google Calendar, refreshed about once a day. Copy the link and paste it into your
              browser's address bar. If the Calendar app opens after you sign in, go back to the browser and add the
              calendar there. Then turn on Sync for Niche Notes in the Calendar app's settings.
            </p>
          ) : (
            <p className="mb-2 text-sm text-ink-muted">
              Dated checkbox lines in your calendar. Google Calendar adds it on its website and refreshes it about once a
              day. To see it on a phone, turn on Sync for Niche Notes in the Calendar app's settings.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!android && (
              <Button disabled={!calendar} onClick={() => window.open(google!, '_blank')}>
                Add to Google Calendar
              </Button>
            )}
            <Button disabled={!calendar} onClick={() => void navigator.clipboard.writeText(copy!).then(() => setCopied(true))}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <Dialog.Close asChild>
            <Button className="mt-5 w-full">Done</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
