import Collaboration from '@tiptap/extension-collaboration'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useNavigate } from 'react-router-dom'
import type * as Y from 'yjs'
import { useDoc, useStore, useY } from '../sync/hooks'
import { isDeleted, ownerOf } from '../sync/tree'
import { ShareDialog } from './ShareDialog'
import { Toolbar } from './Toolbar'

export function NoteView({ id }: { id: string }) {
  const doc = useDoc(id)
  if (!doc) return null
  return <Editor id={id} doc={doc} />
}

function Editor({ id, doc }: { id: string; doc: Y.Doc }) {
  const s = useStore()
  const navigate = useNavigate()
  const meta = doc.getMap('meta')
  useY(meta)

  const editor = useEditor(
    {
      extensions: [
        // Y.js owns undo and redo, through the Collaboration extension.
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Write…' }),
        Collaboration.configure({ document: doc, field: 'content' }),
      ],
      editorProps: { attributes: { class: 'editor-body' } },
    },
    [doc],
  )

  if (isDeleted(id)) {
    return <p className="m-auto text-ink-muted">This note was deleted.</p>
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b-2 border-border bg-surface px-3 py-2">
        <button type="button" className="px-2 py-1 text-xl md:hidden" onClick={() => navigate('/')} aria-label="Back">
          ←
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-ink-muted"
          placeholder="Title"
          value={(meta.get('title') as string | undefined) ?? ''}
          onChange={(e) => meta.set('title', e.target.value)}
        />
        {ownerOf(id) === s.me!.id && <ShareDialog id={id} />}
      </header>
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
      <Toolbar editor={editor} />
    </>
  )
}
