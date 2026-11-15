import { textOf } from './store'
import { nodes, titleOf } from './tree'

export interface Hit {
  id: string
  snippet: string
}

// Title matches first, then text matches, each with the words around the first hit.
export function search(query: string): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const titles: Hit[] = []
  const bodies: Hit[] = []
  for (const id of nodes().keys()) {
    const text = textOf(id)
    const at = text.toLowerCase().indexOf(q)
    if (titleOf(id).toLowerCase().includes(q)) titles.push({ id, snippet: text.slice(0, 80) })
    else if (at >= 0) bodies.push({ id, snippet: text.slice(Math.max(0, at - 30), at + 50) })
  }
  return [...titles, ...bodies]
}
