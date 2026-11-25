import { useEffect } from 'react'

const mac = navigator.platform.startsWith('Mac')
export const MOD = mac ? '⌘' : 'Ctrl+'
export const SHIFT = mac ? '⇧' : 'Shift+'
export const ALT = mac ? '⌥' : 'Alt+'

// The Android app, which says so through `nicheNotesApp`.
export const inAndroidApp = () =>
  Boolean((window as { nicheNotesApp?: { version: number } }).nicheNotesApp) && /Android/.test(navigator.userAgent)

// Holding Ctrl or ⌘ for half a second shows each shortcut beside its button, through `data-keys` on the page. Any other
// key pressed meanwhile is a shortcut being used, so they stay hidden.
export function useKeyHints() {
  useEffect(() => {
    if (!matchMedia('(any-pointer: fine)').matches || inAndroidApp()) return
    const root = document.documentElement
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      clearTimeout(timer)
      delete root.dataset.keys
    }
    const down = (e: KeyboardEvent) => {
      if (e.key !== (mac ? 'Meta' : 'Control')) return stop()
      if (e.repeat) return
      stop()
      if (!(e.shiftKey || e.altKey || (mac ? e.ctrlKey : e.metaKey))) timer = setTimeout(() => (root.dataset.keys = ''), 500)
    }
    const up = (e: KeyboardEvent) => e.key === (mac ? 'Meta' : 'Control') && stop()
    const hidden = () => document.hidden && stop()
    addEventListener('keydown', down, true)
    addEventListener('keyup', up, true)
    addEventListener('blur', stop)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      stop()
      removeEventListener('keydown', down, true)
      removeEventListener('keyup', up, true)
      removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
}
