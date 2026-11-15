import type * as Y from 'yjs'
import { api } from '../lib/api'
import { getDoc, openDoc, purgeLocal, store, subscribe } from './store'

export interface Node {
  parent: string | null
  order: number
  pinned?: boolean
  collapsed?: boolean
  // A color picked for the note, seen only by this person.
  color?: string
  // When we put someone else's note in our trash. Their note is untouched.
  leftAt?: number
}

const TRASH_DAYS = 30

export function nodes(): Y.Map<Node> {
  return getDoc(store.me!.id)!.getMap<Node>('nodes')
}

// Per-user preferences, so they follow the user to every device like the tree does.
export function settings() {
  return getDoc(store.me!.id)!.getMap('settings')
}

export function titleOf(id: string) {
  return (store.meta.get(id)?.title as string | undefined) || 'Untitled'
}

export function isDeleted(id: string) {
  return store.meta.get(id)?.deleted === true
}

export function hasLeft(id: string) {
  return nodes().get(id)?.leftAt != null
}

// In this user's trash: the owner deleted it, or we left it.
export function inTrash(id: string) {
  return isDeleted(id) || hasLeft(id)
}

function trashedAt(id: string) {
  return nodes().get(id)?.leftAt ?? (store.meta.get(id)?.deletedAt as number | undefined) ?? 0
}

export function ownerOf(id: string) {
  return store.owners.get(id) ?? store.me!.id
}

export function isMine(id: string) {
  return ownerOf(id) === store.me!.id
}

// A family knows each other by first name, and a full one crowds the row.
export function ownerName(id: string) {
  return store.users.find((u) => u.id === ownerOf(id))?.name.split(' ')[0] ?? 'shared with me'
}

export function shareCount(id: string) {
  return store.shares.filter((s) => s.doc_id === id).length
}

const orderOf = (id: string) => nodes().get(id)?.order ?? 0

export function isPinned(id: string) {
  return nodes().get(id)?.pinned === true
}

export function togglePin(id: string) {
  const node = nodes().get(id)
  if (node) nodes().set(id, { ...node, pinned: !node.pinned })
}

export function setColor(id: string, color: string | undefined) {
  const node = nodes().get(id)
  if (!node) return
  const next = { ...node, color }
  if (!color) delete next.color
  nodes().set(id, next)
}

export function isCollapsed(id: string) {
  return nodes().get(id)?.collapsed === true
}

export function toggleCollapsed(id: string) {
  const node = nodes().get(id)
  if (node) nodes().set(id, { ...node, collapsed: !node.collapsed })
}

export function expand(id: string) {
  const node = nodes().get(id)
  if (node?.collapsed) nodes().set(id, { ...node, collapsed: false })
}

// Every row asks for its children on each redraw, so they are sorted once per change instead of once per row.
let index: Map<string | null, string[]> | undefined
subscribe(() => (index = undefined))

// Pinned first, then highest order, so a new note (order = now) lands on top of the unpinned.
export function children(parent: string | null): string[] {
  if (!index) {
    index = new Map()
    for (const [id, node] of nodes()) {
      if (inTrash(id)) continue
      const kids = index.get(node.parent) ?? []
      kids.push(id)
      index.set(node.parent, kids)
    }
    for (const kids of index.values()) {
      kids.sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || orderOf(b) - orderOf(a))
    }
  }
  return index.get(parent) ?? []
}

export function descendants(id: string, acc = new Set<string>()): Set<string> {
  for (const child of children(id)) {
    acc.add(child)
    descendants(child, acc)
  }
  return acc
}

export function createNote(parent: string | null, order = Date.now()): string {
  const id = crypto.randomUUID()
  store.owners.set(id, store.me!.id)
  nodes().set(id, { parent, order })
  void openDoc(id)
  return id
}

const wouldLoop = (id: string, parent: string | null) => parent === id || (!!parent && descendants(id).has(parent))

// A moved note goes on top of its new scope, where the drop line showed it.
export function placeNote(id: string, parent: string | null) {
  if (wouldLoop(id, parent)) return
  nodes().set(id, { parent, order: Date.now(), collapsed: isCollapsed(id) })
}

// Dropped among the pinned, it is pinned, so it lands where the line showed. The whole group it
// lands in gets fresh orders, so ties and midpoints can never put it anywhere else.
export function placeSibling(id: string, target: string, where: 'before' | 'after') {
  const map = nodes()
  const parent = map.get(target)?.parent ?? null
  if (target === id || wouldLoop(id, parent)) return
  const pinned = isPinned(target)
  const group = children(parent).filter((s) => s !== id && isPinned(s) === pinned)
  group.splice(group.indexOf(target) + (where === 'after' ? 1 : 0), 0, id)
  let order = Date.now()
  map.doc!.transact(() => {
    for (const s of group) {
      map.set(s, s === id ? { parent, order, pinned, collapsed: isCollapsed(id) } : { ...map.get(s)!, order })
      order--
    }
  })
}

// Children move up to the removed note's parent, so nothing drops out of the tree.
function liftChildren(id: string) {
  const map = nodes()
  const parent = map.get(id)?.parent ?? null
  map.doc!.transact(() => {
    for (const child of children(id)) map.set(child, { ...map.get(child)!, parent })
  })
}

export function removeFromTree(id: string) {
  liftChildren(id)
  nodes().delete(id)
}

// Deleting our own note is a flag in it, so it syncs everywhere, and leaving someone else's is a mark in our tree.
// The placement stays, which is what Restore puts back. Alone, a note's children move up to its parent. With its
// notes, everything under it goes at the same moment, which is how it all comes back together. Our own notes load
// first, so they all go in one step instead of one redraw each.
export async function removeNote(id: string, withNotes: boolean) {
  const at = Date.now()
  if (!withNotes) liftChildren(id)
  const notes = withNotes ? [id, ...descendants(id)] : [id]
  const docs = await Promise.all(notes.map((note) => (isMine(note) ? openDoc(note) : undefined)))
  notes.forEach((note, i) => {
    const doc = docs[i]
    if (!doc) nodes().set(note, { ...nodes().get(note)!, leftAt: at })
    else
      doc.transact(() => {
        doc.getMap('meta').set('deleted', true)
        doc.getMap('meta').set('deletedAt', at)
      })
  })
}

// The note and every note under it that went to the trash at the same moment.
function trashedWith(id: string): string[] {
  const under = [...nodes()].filter(([kid, node]) => node.parent === id && inTrash(kid) && trashedAt(kid) === trashedAt(id))
  return [id, ...under.flatMap(([kid]) => trashedWith(kid))]
}

// Under a note that is gone or still in the trash, a restored note would stay out of sight, so it comes back at the
// top. The trash lists notes that may not have loaded yet, so they all load first, then come back in one step
// instead of one redraw each.
export async function restoreNote(id: string) {
  const parent = nodes().get(id)?.parent
  const hidden = parent != null && (!nodes().has(parent) || inTrash(parent))
  const notes = trashedWith(id)
  const docs = await Promise.all(notes.map(openDoc))
  notes.forEach((note, i) => {
    const node = nodes().get(note)
    if (node?.leftAt != null) {
      nodes().set(note, { parent: node.parent, order: node.order, pinned: node.pinned, collapsed: node.collapsed })
      return
    }
    const meta = docs[i].getMap('meta')
    meta.set('deleted', false)
    meta.delete('deletedAt')
    if (!node) nodes().set(note, { parent: null, order: Date.now() })
  })
  if (hidden) nodes().set(id, { ...nodes().get(id)!, parent: null })
}

// A note that went to the trash with the one above it is part of that one's entry.
export function trashed(): string[] {
  return [...nodes()]
    .filter(([id, { parent }]) => {
      if (!((isDeleted(id) && isMine(id)) || hasLeft(id))) return false
      return !(parent != null && inTrash(parent) && trashedAt(parent) === trashedAt(id))
    })
    .map(([id]) => id)
    .sort((a, b) => trashedAt(b) - trashedAt(a))
}

// Gone for good, with what went to the trash with it: our own notes with all their rows, or just our share of
// someone else's. The deepest go first, so a failure leaves the rest in the trash as they were.
export async function purgeNote(id: string) {
  for (const note of trashedWith(id).reverse()) {
    if (isMine(note)) await api.deleteDoc(note)
    else await api.unshare(note, store.me!.id)
    nodes().delete(note)
    await purgeLocal(note)
  }
}

export async function purgeExpired() {
  const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000
  for (const id of trashed()) {
    // A note's cached meta can say deleted before its date arrives, which is no proof it is old.
    const at = trashedAt(id)
    if (at && at < cutoff) await purgeNote(id).catch(() => {})
  }
}
