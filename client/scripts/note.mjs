#!/usr/bin/env node
// Read and tick notes from the terminal, through the same channel the app uses.
//   node scripts/note.mjs list
//   node scripts/note.mjs show "<title>"
//   node scripts/note.mjs check "<title>" "<item text>"
// NOTES_URL (default http://localhost:4000) and NOTES_AS (dev login name, default dev).
import { Socket } from 'phoenix'
import * as Y from 'yjs'

const BASE = process.env.NOTES_URL ?? 'http://localhost:4000'
const AS = process.env.NOTES_AS ?? 'dev'
const [command, titleArg, itemArg] = process.argv.slice(2)

const login = await fetch(`${BASE}/auth/login?as=${AS}`, { redirect: 'manual' })
const cookie = login.headers.get('set-cookie').split(';')[0]
const { user, token } = await (await fetch(`${BASE}/api/me`, { headers: { cookie } })).json()

const socket = new Socket(BASE.replace(/^http/, 'ws') + '/socket', { params: { token } })
socket.connect()

function openDoc(id) {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc()
    const channel = socket.channel(`doc:${id}`, { since: 0 })
    channel
      .join()
      .receive('ok', ({ updates }) => {
        for (const [, update] of updates) Y.applyUpdate(doc, Buffer.from(update, 'base64'))
        resolve({ doc, channel })
      })
      .receive('error', reject)
  })
}

const text = (node) =>
  node instanceof Y.XmlText
    ? node.toString().replace(/<[^>]+>/g, '')
    : node.toArray().map(text).join('')

function render(node, depth = 0) {
  if (node instanceof Y.XmlText) return text(node)
  const pad = '  '.repeat(depth)
  const kids = node.toArray()
  switch (node.nodeName) {
    case 'taskItem': {
      const [first, ...rest] = kids
      const box = isChecked(node) ? 'x' : ' '
      return `${pad}- [${box}] ${text(first)}\n` + rest.map((k) => render(k, depth + 1)).join('')
    }
    case 'listItem': {
      const [first, ...rest] = kids
      return `${pad}- ${text(first)}\n` + rest.map((k) => render(k, depth + 1)).join('')
    }
    case 'taskList':
    case 'bulletList':
    case 'orderedList':
      return kids.map((k) => render(k, depth)).join('')
    case 'heading':
      return `${pad}# ${text(node)}\n`
    case 'paragraph':
      return `${pad}${text(node)}\n`
    default:
      return kids.map((k) => render(k, depth)).join('')
  }
}

const isChecked = (el) => el.getAttribute('checked') === true || el.getAttribute('checked') === 'true'

function* taskItems(node) {
  if (node instanceof Y.XmlText) return
  if (node.nodeName === 'taskItem') yield node
  for (const kid of node.toArray()) yield* taskItems(kid)
}

const { doc: tree } = await openDoc(user.id)
const ids = [...tree.getMap('nodes').keys()]
const notes = await Promise.all(ids.map(async (id) => ({ id, ...(await openDoc(id)) })))
const titled = notes
  .map((n) => ({ ...n, title: n.doc.getMap('meta').get('title') ?? '', deleted: n.doc.getMap('meta').get('deleted') === true }))
  .filter((n) => !n.deleted)

const pick = () => {
  const hit = titled.find((n) => n.title.toLowerCase().includes((titleArg ?? '').toLowerCase()))
  if (!hit) {
    console.error(`no note titled like ${JSON.stringify(titleArg)}`)
    process.exit(1)
  }
  return hit
}

if (command === 'list') {
  for (const n of titled) console.log(`${n.title || 'Untitled'}  (${n.id})`)
} else if (command === 'show') {
  const note = pick()
  console.log(`# ${note.title}\n`)
  process.stdout.write(render(note.doc.getXmlFragment('content')))
} else if (command === 'check') {
  const note = pick()
  const content = note.doc.getXmlFragment('content')
  const needle = itemArg.toLowerCase()
  const items = [...taskItems(content)].filter((el) => text(el.toArray()[0]).toLowerCase().includes(needle))
  // A plain line that matches becomes a ticked item, joining the task list right above it if there is one.
  const lines = content.toArray().filter((el) => el.nodeName === 'paragraph' && text(el).toLowerCase().includes(needle))
  if (items.length === 0 && lines.length === 0) {
    console.error(`no line containing ${JSON.stringify(itemArg)}`)
    process.exit(1)
  }
  await new Promise((resolve) => {
    note.doc.once('update', (update) => {
      note.channel.push('update', { update: Buffer.from(update).toString('base64') }).receive('ok', resolve)
    })
    note.doc.transact(() => {
      for (const el of items) el.setAttribute('checked', typeof el.getAttribute('checked') === 'string' ? 'true' : true)
      for (const line of lines) {
        const index = content.toArray().indexOf(line)
        const paragraph = new Y.XmlElement('paragraph')
        const words = new Y.XmlText()
        words.insert(0, text(line))
        paragraph.insert(0, [words])
        const item = new Y.XmlElement('taskItem')
        item.setAttribute('checked', true)
        item.insert(0, [paragraph])
        const above = content.get(index - 1)
        content.delete(index, 1)
        if (above && above.nodeName === 'taskList') above.insert(above.length, [item])
        else {
          const list = new Y.XmlElement('taskList')
          list.insert(0, [item])
          content.insert(index, [list])
        }
      }
    })
  })
  for (const el of items) console.log(`checked: ${text(el.toArray()[0])}`)
  for (const line of lines) console.log(`checked: ${text(line)}`)
} else {
  console.error('usage: note.mjs list | show "<title>" | check "<title>" "<item>"')
  process.exit(1)
}
socket.disconnect()
process.exit(0)
