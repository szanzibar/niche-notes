import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import { enableAlerts } from '../lib/alerts'
import { api } from '../lib/api'
import { useY } from '../sync/hooks'
import { settings } from '../sync/tree'
import { importAmplenote } from './amplenote'
import { Button, IconButton } from './Button'
import { InfoIcon, SettingsIcon } from './icons'
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
  const [alerts, setAlerts] = useState('Notification' in window ? Notification.permission : null)
  const zip = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const open = (opened: boolean) => {
    if (!opened) return
    setAlerts('Notification' in window ? Notification.permission : null)
    api
      .googleCalendar()
      .then(setGoogle)
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
          className="fixed left-1/2 top-1/2 max-h-[92dvh] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-border bg-surface p-5 shadow-brutal"
        >
          <Dialog.Title className="mb-3 text-lg font-bold">Settings</Dialog.Title>
          <p className="mb-2 font-medium">Appearance</p>
          <div className="flex flex-wrap gap-2">
            {APPEARANCES.map(([name, value]) => (
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
          <p className="mb-2 mt-5 font-medium">Color scheme</p>
          <div className="flex flex-wrap gap-2">
            {SCHEMES.map(([name, value]) => (
              <Button
                key={name}
                variant={scheme === value ? 'primary' : 'default'}
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
              <div className="mb-2 mt-5 flex items-center">
                <p className="font-medium">Alerts</p>
                {alerts === 'denied' && (
                  <Info label="About alerts">
                    Allow notifications for Niche Notes in your phone's settings, then close the app and open it again.
                  </Info>
                )}
              </div>
              {alerts === 'granted' && <p className="text-sm text-ink-muted">On for this device.</p>}
              {alerts === 'default' && (
                <Button onClick={() => void enableAlerts().then(() => setAlerts(Notification.permission))}>
                  Turn on alerts
                </Button>
              )}
              {alerts === 'denied' && <p className="text-sm text-ink-muted">Blocked on this device.</p>}
            </>
          )}
          <div className="mb-2 mt-5 flex items-center">
            <p className="font-medium">Calendar</p>
            <Info label="About the calendar">
              Dated checkbox lines go to a Niche Notes calendar in your Google Calendar, a minute after each change.
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
          <p className="mb-2 mt-5 font-medium">Import</p>
          <input
            ref={zip}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setImportMessage('Importing…')
              importAmplenote(file).then(
                (count) => setImportMessage(`Imported ${count} notes into Amplenote import.`),
                () => setImportMessage("That file isn't an Amplenote export."),
              )
            }}
          />
          <Button disabled={importMessage === 'Importing…'} onClick={() => zip.current?.click()}>
            Import from Amplenote
          </Button>
          {importMessage && <p className="mt-2 text-sm text-ink-muted">{importMessage}</p>}
          <Dialog.Close asChild>
            <Button className="mt-5 w-full">Done</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// A section's details stay off the page until someone taps the icon beside its name.
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton label={label} className="-my-2.5 text-ink-muted">
          <InfoIcon className="size-4.5" />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          collisionPadding={8}
          className="max-w-72 border-2 border-border bg-surface p-3 text-sm shadow-brutal"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
