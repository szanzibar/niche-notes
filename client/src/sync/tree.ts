import type * as Y from 'yjs'
import { api } from '../lib/api'
import { getDoc, openDoc, purgeLocal, store } from './store'

export interface Node {
  parent: string | null
  order: number
  pinned?: boolean
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

export function meta(id: string) {
  return getDoc(id)?.getMap('meta')
}

export function titleOf(id: string) {
  return (meta(id)?.get('title') as string | undefined) || 'Untitled'
}

export function isDeleted(id: string) {
  return meta(id)?.get('deleted') === true
}

export function hasLeft(id: string) {
  return nodes().get(id)?.leftAt != null
}

// In this user's trash: the owner deleted it, or we left it.
export function inTrash(id: string) {
  return isDeleted(id) || hasLeft(id)
}

function trashedAt(id: string) {
  return nodes().get(id)?.leftAt ?? (meta(id)?.get('deletedAt') as number | undefined) ?? 0
}

export function ownerOf(id: string) {
  return store.owners.get(id) ?? store.me!.id
}

export function isMine(id: string) {
  return ownerOf(id) === store.me!.id
}

export function ownerName(id: string) {
  return store.users.find((u) => u.id === ownerOf(id))?.name ?? 'shared with me'
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

// Pinned first, then highest order, so a new note (order = now) lands on top of the unpinned.
export function children(parent: string | null): string[] {
  const out: string[] = []
  nodes().forEach((node, id) => {
    if (node.parent === parent && !inTrash(id)) out.push(id)
  })
  return out.sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || orderOf(b) - orderOf(a))
}

export function descendants(id: string, acc = new Set<string>()): Set<string> {
  for (const child of children(id)) {
    acc.add(child)
    descendants(child, acc)
  }
  return acc
}

export function createNote(parent: string | null): string {
  const id = crypto.randomUUID()
  store.owners.set(id, store.me!.id)
  nodes().set(id, { parent, order: Date.now() })
  void openDoc(id)
  return id
}

const wouldLoop = (id: string, parent: string | null) => parent === id || (!!parent && descendants(id).has(parent))

// A moved note goes on top of its new scope, where the drop line showed it.
export function placeNote(id: string, parent: string | null) {
  if (wouldLoop(id, parent)) return
  nodes().set(id, { parent, order: Date.now() })
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
      map.set(s, s === id ? { parent, order, pinned } : { ...map.get(s)!, order })
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

// Deleting is a flag in the note, so it syncs everywhere. The placement stays, which is what Restore puts back.
export function deleteNote(id: string) {
  liftChildren(id)
  meta(id)?.set('deleted', true)
  meta(id)?.set('deletedAt', Date.now())
}

export function leaveNote(id: string) {
  const node = nodes().get(id)
  if (node) nodes().set(id, { ...node, leftAt: Date.now() })
}

export function restoreNote(id: string) {
  const node = nodes().get(id)
  if (node?.leftAt != null) {
    nodes().set(id, { parent: node.parent, order: node.order, pinned: node.pinned })
    return
  }
  meta(id)?.set('deleted', false)
  meta(id)?.delete('deletedAt')
  if (!node) nodes().set(id, { parent: null, order: Date.now() })
}

export function trashed(): string[] {
  return [...nodes().keys()]
    .filter((id) => (isDeleted(id) && isMine(id)) || hasLeft(id))
    .sort((a, b) => trashedAt(b) - trashedAt(a))
}

// Gone for good: our own note with all its rows, or just our share of someone else's.
export async function purgeNote(id: string) {
  if (isMine(id)) await api.deleteDoc(id)
  else await api.unshare(id, store.me!.id)
  nodes().delete(id)
  await purgeLocal(id)
}

export async function purgeExpired() {
  const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000
  for (const id of trashed()) {
    if (trashedAt(id) < cutoff) await purgeNote(id).catch(() => {})
  }
}
