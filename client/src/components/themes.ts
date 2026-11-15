import { children, inTrash, nodes, settings } from '../sync/tree'

export interface Theme {
  name: string
  color: string
  // The text on a fill of the color.
  text: string
}

// Each column is one hue: a strong color that carries white text on top, and a bright one that carries black text
// below it.
export const THEMES: Theme[] = [
  { name: 'Coral', color: '#FF4F3B', text: '#fff' },
  { name: 'Blue', color: '#2F6BFF', text: '#fff' },
  { name: 'Green', color: '#1A9E5C', text: '#fff' },
  { name: 'Purple', color: '#8B3DFF', text: '#fff' },
  { name: 'Orange', color: '#E8700A', text: '#fff' },
  { name: 'Pink', color: '#E0338A', text: '#fff' },
  { name: 'Teal', color: '#0E9494', text: '#fff' },
  { name: 'Peach', color: '#FF9F85', text: '#111' },
  { name: 'Sky', color: '#6CC6FF', text: '#111' },
  { name: 'Lime', color: '#B5E853', text: '#111' },
  { name: 'Lilac', color: '#C3A3FF', text: '#111' },
  { name: 'Yellow', color: '#FFD23F', text: '#111' },
  { name: 'Bubblegum', color: '#FF8AD0', text: '#111' },
  { name: 'Mint', color: '#5FE0BF', text: '#111' },
]

const byColor = (color: unknown) => THEMES.find((theme) => theme.color === color)
const confetti = () => settings().get('scheme') === 'confetti'

// A note wears the color its viewer picked for it. Under Confetti an unpicked note gets one from its id, so it is the
// same on every device and for everyone else on Confetti.
export function noteTheme(id: string): Theme | undefined {
  const picked = byColor(nodes().get(id)?.color)
  if (picked || !confetti()) return picked
  const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
  return THEMES[Math.abs(hash) % THEMES.length]
}

// The app wears the open note's color, or else the person's own theme. Confetti has no theme of its own, so with no
// note open it wears the note last opened on this device, or the top note.
export function appTheme(open: string | undefined): Theme {
  const shown =
    open ??
    (confetti()
      ? [localStorage.getItem('lastNote'), children(null)[0]].find((id) => id && nodes().has(id) && !inTrash(id))
      : undefined)
  return (shown && noteTheme(shown)) || byColor(settings().get('accent')) || THEMES[0]
}
