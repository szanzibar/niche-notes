import Dexie, { type EntityTable } from 'dexie'
import { Socket } from 'phoenix'
import * as Y from 'yjs'
import { api } from '../lib/api'
import type { Share, User } from '../lib/types'

interface UpdateRow {
  id: number
  doc: string
  seq: number | null
  update: Uint8Array
}
interface DocRow {
  id: string
  seq: number
}
interface KvRow {
  key: string
  value: unknown
}

const db = new Dexie('niche-notes') as Dexie & {
  updates: EntityTable<UpdateRow, 'id'>
  docs: EntityTable<DocRow, 'id'>
  kv: EntityTable<KvRow, 'key'>
}
db.version(1).stores({ updates: '++id, doc', docs: 'id', kv: 'key' })

export const store = { me: null as User | null, shares: [] as Share[], online: false }

let socket: Socket
const docs = new Map<string, Y.Doc>()
const opening = new Map<string, Promise<Y.Doc>>()
const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify() {
  for (const listener of listeners) listener()
}

export function getDoc(id: string) {
  return docs.get(id)
}

let started = false

export async function start(me: User, token: string) {
  if (started) return
  started = true
  store.me = me

  socket = new Socket('/socket', { params: { token } })
  socket.onOpen(() => {
    store.online = true
    notify()
  })
  socket.onClose(() => {
    store.online = false
    notify()
  })
  socket.connect()

  const userChannel = socket.channel(`user:${me.id}`)
  userChannel.on('shares_changed', () => void refreshShares())
  userChannel.join()

  const tree = await openDoc(me.id)
  const nodes = tree.getMap('nodes')
  const openAll = () => nodes.forEach((_node, id) => void openDoc(id))
  nodes.observe(openAll)
  openAll()

  store.shares = ((await db.kv.get('shares'))?.value as Share[] | undefined) ?? []
  openShared()
  void refreshShares()
}

export async function refreshShares() {
  try {
    store.shares = (await api.shares()).shares
  } catch {
    return
  }
  await db.kv.put({ key: 'shares', value: store.shares })
  openShared()
  notify()
}

function openShared() {
  for (const share of store.shares) {
    if (share.owner_id !== store.me!.id) void openDoc(share.doc_id)
  }
}

export async function wipeLocal() {
  await db.delete()
  localStorage.removeItem('session')
}

export function openDoc(id: string): Promise<Y.Doc> {
  const pending = opening.get(id)
  if (pending) return pending
  const promise = load(id)
  opening.set(id, promise)
  return promise
}

async function load(id: string): Promise<Y.Doc> {
  const doc = new Y.Doc()
  const rows = await db.updates.where('doc').equals(id).toArray()
  const seen = new Set<number>()
  for (const row of rows) {
    Y.applyUpdate(doc, row.update, 'local')
    if (row.seq != null) seen.add(row.seq)
  }
  let since = (await db.docs.get(id))?.seq ?? 0
  const inflight = new Set<number>()
  const channel = socket.channel(`doc:${id}`, () => ({ since }))

  const push = (rowId: number, update: Uint8Array) => {
    inflight.add(rowId)
    channel
      .push('update', { update: toBase64(update) })
      .receive('ok', ({ seq }: { seq: number }) => {
        seen.add(seq)
        inflight.delete(rowId)
        void db.updates.update(rowId, { seq })
      })
      .receive('error', () => inflight.delete(rowId))
      .receive('timeout', () => inflight.delete(rowId))
  }

  const fromServer = async (seq: number, encoded: string) => {
    if (seen.has(seq)) return
    seen.add(seq)
    const update = fromBase64(encoded)
    Y.applyUpdate(doc, update, 'remote')
    await db.updates.add({ doc: id, seq, update })
  }

  doc.on('update', async (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || origin === 'local') return
    const rowId = await db.updates.add({ doc: id, seq: null, update })
    if (channel.state === 'joined') push(rowId, update)
  })

  channel.on('update', ({ seq, update }: { seq: number; update: string }) => void fromServer(seq, update))

  // Runs on every (re)join. `since` only advances here, because this reply is the one
  // place we know we hold every update up to a number.
  channel.join().receive('ok', async ({ updates, seq }: { updates: [number, string][]; seq: number }) => {
    for (const [s, u] of updates) await fromServer(s, u)
    since = seq
    await db.docs.put({ id, seq })
    const unsent = await db.updates
      .where('doc')
      .equals(id)
      .filter((row) => row.seq == null && !inflight.has(row.id))
      .toArray()
    for (const row of unsent) push(row.id, row.update)
  })

  docs.set(id, doc)
  notify()
  return doc
}

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
