import * as Y from 'yjs'
import { getDoc, noteIds } from './store'
import { titleOf } from './tree'

export interface Hit {
  id: string
  snippet: string
}

// Plain text per note. A note's first edit after a lookup empties its entry, and the next lookup rebuilds it.
const texts = new Map<string, string>()

function plain(node: Y.XmlFragment | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert?: unknown }[]).map((d) => (typeof d.insert === 'string' ? d.insert : '')).join('')
  }
  if (node instanceof Y.XmlFragment) return node.toArray().map(plain).join(' ')
  return ''
}

export function textOf(id: string) {
  const cached = texts.get(id)
  if (cached) return cached
  const doc = getDoc(id)!
  if (!texts.has(id)) doc.on('update', () => texts.set(id, ''))
  const text = plain(doc.getXmlFragment('content'))
  texts.set(id, text)
  return text
}

// Title matches first, then text matches, each with the words around the first hit.
export function search(query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const titles: Hit[] = []
  const bodies: Hit[] = []
  for (const id of noteIds()) {
    const text = textOf(id)
    const at = text.toLowerCase().indexOf(q)
    if (titleOf(id).toLowerCase().includes(q)) titles.push({ id, snippet: text.slice(0, 80) })
    else if (at >= 0) bodies.push({ id, snippet: text.slice(Math.max(0, at - 30), at + 50) })
  }
  return [...titles, ...bodies]
}
