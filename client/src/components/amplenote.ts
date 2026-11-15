import { createDocument, getSchema } from '@tiptap/react'
import { prosemirrorToYXmlFragment } from '@tiptap/y-tiptap'
import { unzipSync } from 'fflate'
import { Marked, type Tokens } from 'marked'
import { openDoc } from '../sync/store'
import { createNote, nodes } from '../sync/tree'
import { contentExtensions } from './content'
import { dayOf } from './dates'

// Amplenote's markdown as HTML that the editor's own rules read, the way they read a paste.
const markdown = new Marked({
  renderer: {
    // Amplenote mixes checkbox and plain lines in one list, and the editor keeps each kind in a list of its own.
    list(token) {
      const runs: Tokens.ListItem[][] = []
      for (const item of token.items) {
        const run = runs.at(-1)
        if (run?.[0].task === item.task) run.push(item)
        else runs.push([item])
      }
      return runs
        .map((run) => {
          const items = run.map((item) => this.listitem(item)).join('')
          if (run[0].task) return `<ul data-type="taskList">${items}</ul>`
          return token.ordered ? `<ol start="${token.start}">${items}</ol>` : `<ul>${items}</ul>`
        })
        .join('')
    },
    listitem(item) {
      const body = this.parser.parse(item.tokens)
      if (!item.task) return `<li>${body}</li>`
      return `<li data-type="taskItem" data-checked="${item.checked}"${item.checked ? '' : dated(item.raw)}>${body}</li>`
    },
    checkbox: () => '',
    // Amplenote's tables have no header row, so the export's empty one is dropped and every row comes in as cells.
    table(token) {
      const rows = token.header.some((cell) => cell.text.trim()) ? [token.header, ...token.rows] : token.rows
      const cells = (row: Tokens.TableCell[]) =>
        row.map((cell) => `<td><p>${this.parser.parseInline(cell.tokens)}</p></td>`).join('')
      return `<table>${rows.map((row) => `<tr>${cells(row)}</tr>`).join('')}</table>`
    },
    image: () => '',
  },
})

// Amplenote keeps a task's details in a comment after its text. Its start time becomes the line's date, and the
// export has no repeat rules.
function dated(raw: string) {
  const comment = raw.split('\n')[0].match(/<!-- (\{.*\}) -->/)
  const { startAt, duration } = comment ? JSON.parse(comment[1]) : {}
  if (!startAt) return ''
  const at = new Date(startAt * 1000)
  const [, hours = 0, minutes = 0] = (duration as string | undefined)?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/) ?? []
  const length = Number(hours) * 60 + Number(minutes)
  return ` data-due="${dayOf(at)}T${at.toTimeString().slice(0, 5)}"${length ? ` data-duration="${length}"` : ''}`
}

const unquote = (value: string) =>
  value.startsWith("'") ? value.slice(1, -1).replaceAll("''", "'") : value.startsWith('"') ? JSON.parse(value) : value

// Each file is YAML front matter, then markdown. Amplenote keeps ticked tasks out of sight under a heading of its own
// at the end, unless the note crosses them out, so they come in ticked and hidden, without that heading. It writes an
// empty line as a lone backslash, which markdown would keep as text.
function readNote(text: string) {
  const [, front = '', body = text] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? []
  const field = (key: string) => front.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1]
  return {
    title: unquote(field('title') ?? ''),
    tag: [...front.matchAll(/^ {2}- (.+)$/gm)].map((match) => unquote(match[1]))[0],
    updated: Date.parse(unquote(field('updated') ?? '')),
    hideChecked: !front.includes('defaultTaskCompletionMode: cross-out'),
    html: markdown
      .parse(body.replace(/^# .*<!-- \{"omit":true\} -->$/gm, '').replaceAll('\\<!--', '<!--'), { async: false })
      .replace(/\\(?=\n?<\/?(?:p|li|ul|ol)[ >])/g, ''),
  }
}

// Everything lands under one new note at the top of the tree. Each tag is a note there, with a nested tag such as
// deutsch/lessons inside its parent's, and a note sits under its first tag. Tags come first in alphabetical order,
// then notes, newest edit first. Importing twice makes a second copy.
export async function importAmplenote(zip: File) {
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()), { filter: (file) => file.name.endsWith('.md') })
  const notes = Object.values(files).map((bytes) => readNote(new TextDecoder().decode(bytes)))
  if (notes.length === 0) return 0

  const titles = new Map<string, string>()
  const tags = new Map<string, string>()
  const placed: [string, (typeof notes)[number]][] = []
  const now = Date.now()
  nodes().doc!.transact(() => {
    const root = createNote(null, now)
    titles.set(root, 'Amplenote import')
    const tagNote = (path: string): string => {
      let id = tags.get(path)
      if (id) return id
      const cut = path.lastIndexOf('/')
      id = createNote(cut < 0 ? root : tagNote(path.slice(0, cut)), now - tags.size - 1)
      tags.set(path, id)
      titles.set(id, path.slice(cut + 1))
      return id
    }
    for (const tag of new Set(notes.flatMap((note) => note.tag ?? []).sort())) tagNote(tag)
    for (const note of notes) placed.push([createNote(note.tag ? tagNote(note.tag) : root, note.updated), note])
  })

  const schema = getSchema(contentExtensions)
  for (const [id, title] of titles) (await openDoc(id)).getMap('meta').set('title', title)
  for (const [id, note] of placed) {
    const doc = await openDoc(id)
    doc.transact(() => {
      doc.getMap('meta').set('title', note.title)
      doc.getMap('meta').set('hideChecked', note.hideChecked)
      prosemirrorToYXmlFragment(createDocument(note.html, schema), doc.getXmlFragment('content'))
    })
  }
  return notes.length
}
