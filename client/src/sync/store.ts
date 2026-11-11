import Dexie, { type EntityTable } from 'dexie'
import { Socket, type Channel } from 'phoenix'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
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
  seq?: number
  owner?: string
  meta?: Record<string, unknown>
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

// The server says when to fold a doc's log into one snapshot. This local limit catches a device
// whose own log keeps growing after another device already folded the server's.
const LOG_LIMIT = 50

export const store = {
  me: null as User | null,
  shares: [] as Share[],
  users: [] as User[],
  owners: new Map<string, string>(),
  // A copy of each note's meta map, so the tree can draw titles before the notes load.
  meta: new Map<string, Record<string, unknown>>(),
  // Docs the server refused since startup. The tree prunes their placements.
  lost: new Set<string>(),
  collapsed: new Set<string>(),
  // Unknown until the first connection attempt settles, so a launch doesn't flash Offline.
  online: null as boolean | null,
}

let socket: Socket
const docs = new Map<string, Y.Doc>()
const opening = new Map<string, Promise<Y.Doc>>()
const channels = new Map<string, Channel>()
const awarenesses = new Map<string, Awareness>()
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

export function noteIds() {
  return [...docs.keys()].filter((id) => id !== store.me!.id)
}

export function getAwareness(id: string) {
  return awarenesses.get(id)!
}

export function toggleCollapsed(id: string) {
  if (!store.collapsed.delete(id)) store.collapsed.add(id)
  notify()
}

export function expand(id: string) {
  if (store.collapsed.delete(id)) notify()
}

let starting: Promise<void> | undefined
let token: string

// Every caller gets the same promise, so nothing renders before the tree doc is loaded.
// The notes load after it, without holding up the first draw.
// A later call only hands the socket a fresher token for its next connect.
export function start(me: User, fresh: string) {
  token = fresh
  return (starting ??= run(me))
}

async function run(me: User) {
  store.me = me

  socket = new Socket('/socket', { params: () => ({ token }) })
  socket.onOpen(() => {
    store.online = true
    notify()
    void refreshSharing()
  })
  socket.onClose(() => {
    store.online = false
    notify()
  })
  socket.connect()
  // Phones switch networks often. Follow the browser instead of waiting for the TCP stack to notice.
  window.addEventListener('offline', () => {
    store.online = false
    notify()
    socket.disconnect()
  })
  window.addEventListener('online', () => socket.connect())
  window.addEventListener('beforeunload', () => {
    for (const awareness of awarenesses.values()) removeAwarenessStates(awareness, [awareness.doc.clientID], 'unload')
  })

  const userChannel = socket.channel(`user:${me.id}`)
  userChannel.on('shares_changed', () => void refreshSharing())
  userChannel.join()

  for (const row of await db.docs.toArray()) {
    if (row.owner) store.owners.set(row.id, row.owner)
    if (row.meta) store.meta.set(row.id, row.meta)
  }

  const tree = await openDoc(me.id)
  const nodes = tree.getMap('nodes')
  nodes.observe((event) => {
    for (const id of event.keysChanged) if (nodes.has(id)) void openDoc(id)
  })
  // One at a time, so the note on screen waits behind one load instead of all of them.
  void (async () => {
    for (const id of [...nodes.keys()]) await openDoc(id)
  })()

  store.shares = ((await db.kv.get('shares'))?.value as Share[] | undefined) ?? []
  store.users = ((await db.kv.get('users'))?.value as User[] | undefined) ?? []
  openShared()
  void refreshSharing()
}

export async function refreshSharing() {
  try {
    const [{ shares }, { users }] = await Promise.all([api.shares(), api.users()])
    store.shares = shares
    store.users = users
  } catch {
    return
  }
  await db.kv.bulkPut([
    { key: 'shares', value: store.shares },
    { key: 'users', value: store.users },
  ])
  for (const [id, owner] of store.owners) {
    if (owner !== store.me!.id && !store.shares.some((s) => s.doc_id === id)) lose(id)
  }
  openShared()
  notify()
}

// Someone else's note that we can no longer open. The tree prunes its placement.
function lose(id: string) {
  forget(id)
  store.lost.add(id)
  notify()
}

function forget(id: string) {
  channels.get(id)?.leave()
  channels.delete(id)
  docs.delete(id)
  opening.delete(id)
  awarenesses.delete(id)
}

// After the server purged a note: drop every local trace of it.
export async function purgeLocal(id: string) {
  forget(id)
  await db.updates.where('doc').equals(id).delete()
  await db.docs.delete(id)
  notify()
}

// A note shared with us lands at the top of our tree, so there is no separate place to look for it.
function openShared() {
  const nodes = docs.get(store.me!.id)!.getMap('nodes')
  let order = Date.now()
  for (const share of store.shares) {
    if (share.owner_id === store.me!.id) continue
    void openDoc(share.doc_id)
    if (!nodes.has(share.doc_id)) nodes.set(share.doc_id, { parent: null, order: order++ })
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
  const awareness = new Awareness(doc)
  awarenesses.set(id, awareness)
  const rows = await db.updates.where('doc').equals(id).toArray()
  const seen = new Set<number>()
  for (const row of rows) {
    Y.applyUpdate(doc, row.update, 'local')
    if (row.seq != null) seen.add(row.seq)
  }
  // Watched after the replay, so replaying the log doesn't write every title the note ever had.
  // A reload before the write lands shows the old title until this note loads again.
  const meta = doc.getMap('meta')
  const copyMeta = () => {
    const value = meta.toJSON()
    if (JSON.stringify(value) === JSON.stringify(store.meta.get(id))) return
    store.meta.set(id, value)
    void db.docs.upsert(id, { meta: value })
    notify()
  }
  copyMeta()
  meta.observe(copyMeta)
  let logged = rows.length
  let since = (await db.docs.get(id))?.seq ?? 0
  const inflight = new Set<Promise<number>>()
  const channel = socket.channel(`doc:${id}`, () => ({ since }))
  channels.set(id, channel)

  const push = (saved: Promise<number>, update: Uint8Array) => {
    inflight.add(saved)
    channel
      .push('update', { update: toBase64(update) })
      .receive('ok', async ({ seq }: { seq: number }) => {
        seen.add(seq)
        inflight.delete(saved)
        await db.updates.update(await saved, { seq })
      })
      .receive('error', () => inflight.delete(saved))
      .receive('timeout', () => inflight.delete(saved))
  }

  const fromServer = async (batch: [number, string][]) => {
    const fresh = batch
      .filter(([seq]) => !seen.has(seq))
      .map(([seq, encoded]) => ({ doc: id, seq, update: fromBase64(encoded) }))
    if (fresh.length === 0) return
    for (const row of fresh) seen.add(row.seq)
    // One transaction, so a note opened on a new device appears whole instead of replaying every keystroke.
    Y.applyUpdate(doc, Y.mergeUpdates(fresh.map((row) => row.update)), 'remote')
    logged += fresh.length
    await db.updates.bulkAdd(fresh)
  }

  // The whole state as one update stands in for every row up to `since`, which we hold in full.
  const compact = () => {
    const upto = since
    const update = Y.encodeStateAsUpdate(doc)
    channel.push('snapshot', { update: toBase64(update), upto }).receive('ok', async () => {
      await db.transaction('rw', db.updates, async () => {
        await db.updates
          .where('doc')
          .equals(id)
          .filter((row) => row.seq != null && row.seq <= upto)
          .delete()
        await db.updates.add({ doc: id, seq: upto, update })
      })
      logged = await db.updates.where('doc').equals(id).count()
    })
  }

  // Send before the local write lands, so a reload right after a keystroke loses nothing the server can give back.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || origin === 'local') return
    logged += 1
    const saved = db.updates.add({ doc: id, seq: null, update })
    if (channel.state === 'joined') push(saved, update)
  })

  channel.on('update', ({ seq, update }: { seq: number; update: string }) => void fromServer([[seq, update]]))

  channel.on('awareness', ({ update }: { update: string }) =>
    applyAwarenessUpdate(awareness, fromBase64(update), 'remote'),
  )
  awareness.on(
    'update',
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote' || channel.state !== 'joined') return
      const update = encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])
      channel.push('awareness', { update: toBase64(update) })
    },
  )

  // Runs on every (re)join. `since` only advances here, because this reply is the one
  // place we know we hold every update up to a number.
  channel
    .join()
    .receive(
      'ok',
      async ({
        updates,
        seq,
        owner_id,
        compact: fold,
      }: {
        updates: [number, string][]
        seq: number
        owner_id: string
        compact: boolean
      }) => {
        if (store.owners.get(id) !== owner_id) {
          store.owners.set(id, owner_id)
          notify()
        }
        await fromServer(updates)
        since = seq
        await db.docs.upsert(id, { seq, owner: owner_id })
        if (since > 0 && (fold || logged > LOG_LIMIT)) compact()
        const inflightIds = new Set(await Promise.all(inflight))
        const unsent = await db.updates
          .where('doc')
          .equals(id)
          .filter((row) => row.seq == null && !inflightIds.has(row.id))
          .toArray()
        for (const row of unsent) push(Promise.resolve(row.id), row.update)
        if (awareness.getLocalState()) {
          channel.push('awareness', { update: toBase64(encodeAwarenessUpdate(awareness, [doc.clientID])) })
        }
      },
    )
    .receive('error', ({ reason }: { reason: string }) => {
      if (reason === 'forbidden') lose(id)
    })

  docs.set(id, doc)
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
