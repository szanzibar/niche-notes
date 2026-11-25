import type * as Y from 'yjs'
import { api } from '../lib/api'
import { acknowledged, getDoc, openDoc, purgeLocal, store, subscribe, textOf } from './store'

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

// The lines this person folded in each note, by line id. A deleted line's id stays behind, a few bytes each.
export function folds() {
  return getDoc(store.me!.id)!.getMap<string[]>('folds')
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

// Who a task on this note can be assigned to: its owner and everyone it is shared with who isn't a guest. A guest
// knows only the owner.
export function people(id: string) {
  const on = [ownerOf(id), ...store.shares.filter((s) => s.doc_id === id).map((s) => s.user_id)]
  return store.users.filter((u) => on.includes(u.id) && !u.guest)
}

export function shareCount(id: string) {
  return store.shares.filter((s) => s.doc_id === id).length
}

export function readOnly(id: string) {
  return store.shares.some((s) => s.doc_id === id && s.user_id === store.me!.id && s.read_only)
}

const orderOf = (id: string) => nodes().get(id)?.order ?? 0

export function isPinned(id: string) {
  return nodes().get(id)?.pinned === true
}

// A new pin goes below the others, which are most likely already in the order we want.
export function togglePin(id: string) {
  const node = nodes().get(id)
  if (!node) return
  nodes().doc!.transact(() => {
    nodes().set(id, { ...node, pinned: !node.pinned })
    moveNotes([id], landing([id], node.parent)!)
  })
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

// The note a new-note link opens: the one the last such link made while it is still blank, so a link opened twice
// makes one note.
export function blankNote(): string {
  const last = localStorage.getItem('blankNote')
  if (last && nodes().has(last) && !inTrash(last) && !store.meta.get(last)?.title) {
    const { text, checked } = textOf(last)
    if (!text && !checked) return last
  }
  const id = createNote(null)
  localStorage.setItem('blankNote', id)
  return id
}

const wouldLoop = (id: string, parent: string | null) => parent === id || (!!parent && descendants(id).has(parent))

// A place among `parent`'s children, counted without the notes that move there.
export interface Spot {
  parent: string | null
  index: number
}

// Where notes that move together land. A moved note keeps its pin, so the first lands within its own group and the
// rest beside it, each within theirs. With no index they go where the pins end.
export function landing(ids: string[], parent: string | null, index?: number): Spot | null {
  if (ids.some((id) => wouldLoop(id, parent))) return null
  const pins = children(parent).filter((s) => !ids.includes(s) && isPinned(s)).length
  const at = index ?? pins
  return { parent, index: isPinned(ids[0]) ? Math.min(at, pins) : Math.max(at, pins) }
}

// Only the moved notes are written, since a device that is behind would write back old parents for any note it
// renumbered. They keep the order given and share the room between their new neighbours, and a group is renumbered
// only when its neighbours' orders leave no room.
export function moveNotes(ids: string[], { parent, index }: Spot) {
  const map = nodes()
  const kids = children(parent).filter((s) => !ids.includes(s))
  const pins = kids.filter(isPinned).length
  const now = Date.now()
  const write = (s: string, to: number) => map.set(s, { ...map.get(s)!, ...(ids.includes(s) && { parent }), order: to })
  map.doc!.transact(() => {
    for (const pinned of [true, false]) {
      const moved = ids.filter((s) => isPinned(s) === pinned)
      const group = kids.filter((s) => isPinned(s) === pinned)
      const at = pinned ? Math.min(index, pins) : Math.max(index, pins) - pins
      const above = at > 0 ? orderOf(group[at - 1]) : Infinity
      const below = at < group.length ? orderOf(group[at]) : -Infinity
      const top = above === Infinity ? Math.max(now, below + moved.length) + 1 : above
      const step = above === Infinity || below === -Infinity ? 1 : (above - below) / (moved.length + 1)
      const orders = moved.map((_, i) => top - step * (i + 1))
      if (orders.every((order, i) => order < (i ? orders[i - 1] : above) && order > below)) {
        moved.forEach((s, i) => write(s, orders[i]))
      } else {
        group.splice(at, 0, ...moved)
        group.forEach((s, i) => write(s, now - i))
      }
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
    if (isMine(note)) {
      // The server empties only a note its own copy has in the trash, so the delete has to get there first.
      await acknowledged(note)
      await api.deleteDoc(note)
    } else await api.unshare(note, store.me!.id)
    nodes().delete(note)
    folds().delete(note)
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
