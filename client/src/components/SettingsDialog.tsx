import * as Dialog from '@radix-ui/react-dialog'
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
  const density = prefs.get('density') as string | undefined

  return (
    <Dialog.Root>
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
                onClick={() => (value ? prefs.set('density', value) : prefs.delete('density'))}
              >
                {name}
              </Button>
            ))}
          </div>
          <Dialog.Close asChild>
            <Button className="mt-5 w-full">Done</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
