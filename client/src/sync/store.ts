import Dexie, { type EntityTable } from 'dexie'
import { Socket, type Channel } from 'phoenix'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { ruleOn } from '../components/dates'
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
  text?: string
  checked?: string
  dated?: Dated[]
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
db.version(2).stores({ updates: '++id, doc, seq', docs: 'id', kv: 'key' })
// Copies from before they held what they hold now are redone from each note's rows, once.
db.version(5).upgrade(async (tx) => {
  for (const row of await tx.table<DocRow>('docs').toArray()) {
    if (row.text == null) continue
    const doc = new Y.Doc()
    for (const { update } of await tx.table<UpdateRow>('updates').where('doc').equals(row.id).toArray()) {
      Y.applyUpdate(doc, update)
    }
    await tx.table<DocRow>('docs').update(row.id, plain(doc.getXmlFragment('content')))
  }
})

// A doc's local log is folded into one row once it grows past this. The server folds its own.
const LOG_LIMIT = 50

export const store = {
  me: null as User | null,
  shares: [] as Share[],
  users: [] as User[],
  owners: new Map<string, string>(),
  // A copy of each note's meta map and plain text, so the tree and search cover notes that aren't open.
  meta: new Map<string, Record<string, unknown>>(),
  texts: new Map<string, Text>(),
  // Docs the server refused since startup. The tree prunes their placements.
  lost: new Set<string>(),
  // Whether the tree holds every placement the server has, which only its join reply on this connection tells.
  // What the app writes to the tree by itself waits for it, since a tree that is behind writes over what it lacks.
  treeCurrent: false,
  // Unknown until the first connection attempt settles, so a launch doesn't flash Offline.
  online: null as boolean | null,
}

let socket: Socket
let userChannel: Channel
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

export function getAwareness(id: string) {
  return awarenesses.get(id)!
}

// An unchecked checkbox line with a date. `item` stays the same while its text and date change.
export interface Dated {
  item: string
  due: string
  text: string
  assignee?: string | null
}
// Search leaves out checked lines unless asked, so their text sits apart. The lines nested under one stay in.
export type Text = { text: string; checked: string; dated: Dated[] }

const itemOf = (line: Y.XmlElement) => `${line._item!.id.client}:${line._item!.id.clock}`

function plain(content: Y.XmlFragment): Text {
  const text: string[] = []
  const checked: string[] = []
  const walk = (node: Y.XmlFragment | Y.XmlText | Y.XmlHook, into: string[]) => {
    if (node instanceof Y.XmlText) {
      into.push((node.toDelta() as { insert?: unknown }[]).map((d) => (typeof d.insert === 'string' ? d.insert : '')).join(''))
    } else if (node instanceof Y.XmlFragment) {
      const done = node instanceof Y.XmlElement && node.nodeName === 'taskItem' && Boolean(node.getAttribute('checked'))
      node.toArray().forEach((kid, i) => walk(kid, done && i === 0 ? checked : into))
    }
  }
  walk(content, text)
  const dated = content.querySelectorAll('taskItem').flatMap((item) => {
    const due = item instanceof Y.XmlElement && !item.getAttribute('checked') && item.getAttribute('due')
    if (!due) return []
    const words: string[] = []
    walk(item.get(0), words)
    return [
      { item: itemOf(item), due, text: words.join(''), assignee: (item.getAttribute('assignee') as string | undefined) ?? null },
    ]
  })
  return { text: text.join(' '), checked: checked.join(' '), dated }
}

// Moves dated lines to another day, in notes that may not be on screen. A line keeps its time and its repeat, as
// it does in the date box.
export async function moveDue(id: string, items: string[], day: string) {
  const doc = await openDoc(id)
  doc.transact(() => {
    for (const line of doc.getXmlFragment('content').querySelectorAll('taskItem') as Y.XmlElement[]) {
      const due = line.getAttribute('due') as string | undefined
      if (!due || !items.includes(itemOf(line))) continue
      const time = due.split('T')[1]
      line.setAttribute('due', time ? `${day}T${time}` : day)
      const repeat = ruleOn(line.getAttribute('repeat') as string | undefined, day)
      if (repeat) line.setAttribute('repeat', repeat)
    }
  })
  notify()
}

// An open note's edits empty its entry, and the next lookup rebuilds it.
export function textOf(id: string): Text {
  const doc = docs.get(id)
  if (doc && !store.texts.has(id)) store.texts.set(id, plain(doc.getXmlFragment('content')))
  return store.texts.get(id) ?? { text: '', checked: '', dated: [] }
}

let starting: Promise<void> | undefined
let token: string

let caughtUp: () => void
// Resolves once this launch holds every change the server had when it connected.
export const synced = new Promise<void>((resolve) => (caughtUp = resolve))
let cursor = 0

// Every caller gets the same promise, so nothing renders before the tree doc is loaded. A note loads only when
// it opens, and stays for the session. A later call only hands the socket a fresher token for its next connect.
export function start(me: User, fresh: string) {
  token = fresh
  return (starting ??= run(me))
}

async function run(me: User) {
  store.me = me

  socket = new Socket('/socket', { params: () => ({ token }) })
  socket.onOpen(() => {
    store.online = true
    store.treeCurrent = false
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
  // Android can keep a dead connection looking open while the app is away, and the heartbeat takes up to a
  // minute to notice. Coming back asks the server at once and treats silence as a missed heartbeat.
  document.addEventListener('visibilitychange', () => {
    // A launch reads search text from this copy, which an open note writes once it has been still, and here in case
    // the page stops sooner.
    if (document.visibilityState !== 'visible') {
      for (const id of docs.keys()) if (id !== me.id) void db.docs.upsert(id, textOf(id))
      return
    }
    const dead = setTimeout(
      () =>
        socket.disconnect(() => {
          // Phoenix's own step on a missed heartbeat, so every channel rejoins on the new connection.
          ;(socket as unknown as { triggerChanError(): void }).triggerChanError()
          socket.connect()
        }),
      3000,
    )
    if (!socket.ping(() => clearTimeout(dead))) clearTimeout(dead)
  })
  window.addEventListener('beforeunload', () => {
    for (const awareness of awarenesses.values()) removeAwarenessStates(awareness, [awareness.doc.clientID], 'unload')
  })

  for (const row of await db.docs.toArray()) {
    if (row.owner) store.owners.set(row.id, row.owner)
    if (row.meta) store.meta.set(row.id, row.meta)
    if (row.text != null) store.texts.set(row.id, { text: row.text, checked: row.checked ?? '', dated: row.dated ?? [] })
  }
  cursor = ((await db.kv.get('cursor'))?.value as number | undefined) ?? 0

  const tree = await openDoc(me.id)
  tree.getMap('nodes').observe(notify)

  // The reply names the notes that changed since the last catch-up. The cursor moves only once they are all here.
  userChannel = socket.channel(`user:${me.id}`, () => ({ after: cursor }))
  userChannel.on('shares_changed', () => void refreshSharing())
  userChannel.on('changed', ({ doc }: { doc: string }) => void pull([doc]).catch(() => {}))
  userChannel
    .join()
    .receive('ok', async ({ changed, seq, generation }: { changed: string[]; seq: number; generation: string }) => {
      const known = (await db.kv.get('generation'))?.value
      if (known && known !== generation) return resend(generation)
      await db.kv.put({ key: 'generation', value: generation })
      pull(changed)
        .then(async () => {
          cursor = seq
          await db.kv.put({ key: 'cursor', value: seq })
          caughtUp()
        })
        .catch(() => {})
    })

  // A note edited while the server was out of reach still has rows to send, which only an open note does.
  const sent = new Set(await db.updates.where('seq').aboveOrEqual(0).primaryKeys())
  const unsent = (await db.updates.toCollection().primaryKeys()).filter((key) => !sent.has(key))
  for (const row of await db.updates.bulkGet(unsent)) void openDoc(row!.doc)

  store.shares = ((await db.kv.get('shares'))?.value as Share[] | undefined) ?? []
  store.users = ((await db.kv.get('users'))?.value as User[] | undefined) ?? []
  openShared()
  void refreshSharing()
}

// The server came back from a backup, which may lack rows this device holds and numbers its new rows from where the
// backup ended. So every row counts as unsent and every cursor starts over, and the next launch sends what the
// backup lacks and reads the rest again. Known and accepted: that launch loads every note at once.
async function resend(generation: string) {
  await db.transaction('rw', db.updates, db.docs, db.kv, async () => {
    await db.updates.toCollection().modify({ seq: null })
    await db.docs.toCollection().modify({ seq: 0 })
    await db.kv.bulkPut([
      { key: 'cursor', value: 0 },
      { key: 'generation', value: generation },
    ])
  })
  location.reload()
}

// Resolves once the server has stored every row this device wrote for the note.
export async function acknowledged(id: string) {
  const unsent = () => db.updates.where('doc').equals(id).filter((row) => row.seq == null).count()
  while ((await unsent()) > 0) await new Promise((resolve) => setTimeout(resolve, 100))
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

// A note shared with us lands at the top of our tree, so there is no separate place to look for it. Its rows may
// all be older than our cursor, so it comes in by itself. A tree that is behind can't tell a note with no place
// from one another device placed, so only a current tree places it.
function openShared() {
  const shared = store.shares.filter((share) => share.owner_id !== store.me!.id).map((share) => share.doc_id)
  if (store.treeCurrent) {
    const nodes = docs.get(store.me!.id)!.getMap('nodes')
    let order = Date.now()
    for (const id of shared) if (!nodes.has(id)) nodes.set(id, { parent: null, order: order++ })
  }
  void pull(shared.filter((id) => !store.meta.has(id))).catch(() => {})
}

// Notes that aren't open get their new rows here, folded into one, and their copy for the tree and search redone
// from them. Pings arrive per keystroke while someone types in such a note, so they gather while a pull runs.
const stale = new Set<string>()
let pulling: Promise<void> | undefined

function pull(ids: string[]) {
  for (const id of ids) stale.add(id)
  return (pulling ??= (async () => {
    while (stale.size > 0) {
      const batch = [...stale].slice(0, 100)
      for (const id of batch) stale.delete(id)
      await pullBatch(batch)
    }
  })().finally(() => (pulling = undefined)))
}

async function pullBatch(ids: string[]) {
  const rows = await db.docs.bulkGet(ids)
  const asked = ids.flatMap((id, i) => (opening.has(id) ? [] : [[id, rows[i]?.seq ?? 0]]))
  if (asked.length === 0) return
  const { docs: pulled } = await new Promise<{ docs: [string, string, number, [number, string][]][] }>(
    (resolve, reject) =>
      userChannel.push('pull', { docs: asked }, 30_000).receive('ok', resolve).receive('error', reject).receive('timeout', reject),
  )
  // The tree draws titles, trash, owners and the lines that are due, so a pull that changed only other text doesn't
  // redraw it.
  let redraw = false
  for (const [id, owner, seq, updates] of pulled) {
    if (opening.has(id)) continue
    const doc = new Y.Doc()
    const local = await db.updates.where('doc').equals(id).toArray()
    for (const row of local) Y.applyUpdate(doc, row.update)
    for (const [, update] of updates) Y.applyUpdate(doc, fromBase64(update))
    const meta = doc.getMap('meta').toJSON()
    const copy = plain(doc.getXmlFragment('content'))
    await db.transaction('rw', db.updates, db.docs, async () => {
      await db.updates.bulkDelete(local.filter((row) => row.seq != null).map((row) => row.id))
      await db.updates.add({ doc: id, seq, update: Y.encodeStateAsUpdate(doc) })
      await db.docs.put({ id, seq, owner, meta, ...copy })
    })
    redraw ||=
      owner !== store.owners.get(id) ||
      JSON.stringify(meta) !== JSON.stringify(store.meta.get(id)) ||
      JSON.stringify(copy.dated) !== JSON.stringify(textOf(id).dated)
    store.owners.set(id, owner)
    store.meta.set(id, meta)
    store.texts.set(id, copy)
  }
  if (redraw) notify()
}

export async function wipeLocal() {
  await db.delete()
  localStorage.removeItem('session')
  localStorage.removeItem('recent')
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
  // A reload before the write lands shows the old title until the launch catches up.
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
  // The tree draws the lines that are due, so it hears when an open note's change, once the note has been still.
  // The device keeps that copy then too, since a phone can end the app without telling the page.
  let dated = JSON.stringify(textOf(id).dated)
  let still: number | undefined
  store.texts.delete(id)
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

  // The whole state as one row stands in for every row up to `since`, which we hold in full.
  const fold = async () => {
    const upto = since
    const update = Y.encodeStateAsUpdate(doc)
    await db.transaction('rw', db.updates, async () => {
      await db.updates
        .where('doc')
        .equals(id)
        .filter((row) => row.seq != null && row.seq <= upto)
        .delete()
      await db.updates.add({ doc: id, seq: upto, update })
    })
    logged = await db.updates.where('doc').equals(id).count()
  }

  // Send before the local write lands, so a reload right after a keystroke loses nothing the server can give back.
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    store.texts.delete(id)
    clearTimeout(still)
    still = window.setTimeout(() => {
      if (id !== store.me!.id) void db.docs.upsert(id, textOf(id))
      const now = JSON.stringify(textOf(id).dated)
      if (now !== dated) notify()
      dated = now
    }, 500)
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
      async ({ updates, seq, owner_id }: { updates: [number, string][]; seq: number; owner_id: string }) => {
        if (store.owners.get(id) !== owner_id) {
          store.owners.set(id, owner_id)
          notify()
        }
        await fromServer(updates)
        if (id === store.me!.id) {
          store.treeCurrent = true
          openShared()
          notify()
        }
        since = seq
        await db.docs.upsert(id, { seq, owner: owner_id })
        if (since > 0 && logged > LOG_LIMIT) await fold()
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
