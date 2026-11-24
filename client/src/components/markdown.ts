import { MarkdownManager } from '@tiptap/markdown'
import type { JSONContent } from '@tiptap/react'
import { yDocToProsemirrorJSON } from '@tiptap/y-tiptap'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { readDoc } from '../sync/store'
import { children, people, titleOf } from '../sync/tree'
import { contentExtensions } from './content'

const markdown = new MarkdownManager({ extensions: contentExtensions })

// A note ends in an empty line the editor keeps for the cursor. Tasks assigned to someone no longer on the note
// export as unassigned, matching how the app shows them.
const markdownOf = async (id: string) => {
  const on = new Set(people(id).map((u) => u.id))
  const clean = (node: JSONContent): JSONContent => ({
    ...node,
    attrs: node.attrs?.assignee && !on.has(node.attrs.assignee) ? { ...node.attrs, assignee: null } : node.attrs,
    content: node.content?.map(clean),
  })
  return markdown.serialize(clean(yDocToProsemirrorJSON(await readDoc(id), 'content'))).trimEnd()
}

// Windows refuses these characters in a file name, and dots or spaces at its end. A cut title stays under every
// system's length limit.
const fileName = (id: string) =>
  titleOf(id).replace(/[\\/:*?"<>|\p{Cc}]/gu, '-').slice(0, 100).replace(/[. ]+$/, '') || 'Untitled'

function download(name: string, data: string | Uint8Array<ArrayBuffer>, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

export async function exportNote(id: string) {
  download(`${fileName(id)}.md`, await markdownOf(id), 'text/markdown')
}

// A note is its .md file, and the notes under it sit in a folder of the same name. A Mac or Windows ignores case,
// so siblings stay apart without it.
export async function exportAll() {
  const folder = async (parent: string | null) => {
    const files: Zippable = {}
    const taken = new Set<string>()
    for (const id of children(parent)) {
      let name = fileName(id)
      for (let n = 2; taken.has(name.toLowerCase()) || taken.has(`${name}.md`.toLowerCase()); n++) {
        name = `${fileName(id)} (${n})`
      }
      taken.add(name.toLowerCase()).add(`${name}.md`.toLowerCase())
      files[`${name}.md`] = strToU8(await markdownOf(id))
      if (children(id).length > 0) files[name] = await folder(id)
    }
    return files
  }
  download('Niche Notes.zip', zipSync(await folder(null)), 'application/zip')
}
