import type * as Y from 'yjs'
import { getDoc, openDoc, store } from './store'

export interface Node {
  parent: string | null
  order: number
}

export function nodes(): Y.Map<Node> {
  return getDoc(store.me!.id)!.getMap<Node>('nodes')
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

export function ownerOf(id: string) {
  return store.shares.find((s) => s.doc_id === id)?.owner_id ?? store.me!.id
}

export function children(parent: string | null): string[] {
  const out: { id: string; order: number }[] = []
  nodes().forEach((node, id) => {
    if (node.parent === parent && !isDeleted(id)) out.push({ id, order: node.order })
  })
  return out.sort((a, b) => b.order - a.order).map((n) => n.id)
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
  nodes().set(id, { parent, order: Date.now() })
  void openDoc(id)
  return id
}

export function placeNote(id: string, parent: string | null) {
  if (parent === id || (parent && descendants(id).has(parent))) return
  nodes().set(id, { parent, order: nodes().get(id)?.order ?? Date.now() })
}

// Children move up to the removed note's parent, so nothing drops out of the tree.
export function removeFromTree(id: string) {
  const map = nodes()
  const parent = map.get(id)?.parent ?? null
  map.doc!.transact(() => {
    for (const child of children(id)) map.set(child, { ...map.get(child)!, parent })
    map.delete(id)
  })
}

export function deleteNote(id: string) {
  meta(id)?.set('deleted', true)
  removeFromTree(id)
}

export function sharedWithMeUnplaced(): string[] {
  const ids = new Set(store.shares.filter((s) => s.owner_id !== store.me!.id).map((s) => s.doc_id))
  return [...ids].filter((id) => !nodes().has(id) && !isDeleted(id))
}
