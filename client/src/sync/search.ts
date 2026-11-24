import { textOf } from './store'
import { children, descendants, inTrash, nodes, titleOf } from './tree'

export interface Hit {
  id: string
  snippet: string
  // How far it sits under the matching title it is listed with.
  depth: number
}

// Title matches first, each followed by every note under it, then text matches, each with the words around the
// first hit.
export function search(query: string, { trash, checked }: { trash: boolean; checked: boolean }): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const titles: string[] = []
  const bodies: string[] = []
  const snippets = new Map<string, string>()
  for (const id of nodes().keys()) {
    if (!trash && inTrash(id)) continue
    const copy = textOf(id)
    const text = checked ? `${copy.text} ${copy.checked}` : copy.text
    const at = text.toLowerCase().indexOf(q)
    if (titleOf(id).toLowerCase().includes(q)) {
      titles.push(id)
      snippets.set(id, text.slice(0, 80))
    } else if (at >= 0) {
      bodies.push(id)
      snippets.set(id, text.slice(Math.max(0, at - 30), at + 50))
    }
  }
  const under = new Set<string>()
  for (const id of titles) descendants(id, under)
  const hits: Hit[] = []
  const list = (id: string, depth: number) => {
    hits.push({ id, snippet: snippets.get(id) ?? '', depth })
    for (const kid of children(id)) list(kid, depth + 1)
  }
  for (const id of titles) if (!under.has(id)) list(id, 0)
  for (const id of bodies) if (!under.has(id)) hits.push({ id, snippet: snippets.get(id)!, depth: 0 })
  return hits
}
