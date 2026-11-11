import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Y from 'yjs'
import { useDoc, useStore, useY } from '../sync/hooks'
import { getAwareness, getDoc } from '../sync/store'
import {
  deleteNote,
  hasLeft,
  inTrash,
  isMine,
  isPinned,
  leaveNote,
  nodes,
  ownerName,
  purgeNote,
  restoreNote,
  shareCount,
  titleOf,
  togglePin,
} from '../sync/tree'
import { Button, IconButton } from './Button'
import { LeaveIcon, PinIcon, TrashIcon, UsersIcon } from './icons'
import { OfflineIcon } from './OfflineIcon'
import { ShareDialog } from './ShareDialog'
import { ListTabs } from './lists'
import { Toolbar } from './Toolbar'

// One per note for the app's lifetime, so undo survives leaving and reopening the note.
// y-tiptap destroys the manager together with the editor view, so ours ignores that.
class NoteUndoManager extends Y.UndoManager {
  destroy() {}
}
const undoManagers = new Map<string, Y.UndoManager>()
function undoManagerFor(id: string, doc: Y.Doc) {
  let manager = undoManagers.get(id)
  if (!manager) {
    manager = new NoteUndoManager(doc.getXmlFragment('content'), { trackedOrigins: new Set([ySyncPluginKey]) })
    undoManagers.set(id, manager)
  }
  return manager
}

const caretColors = ['#FF4F3B', '#2F6BFF', '#1DB954', '#F5A623', '#9B51E0', '#00A3A3']
function caretColor(userId: string) {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return caretColors[hash % caretColors.length]
}

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
  useY(nodes())
  const titleRef = useRef<HTMLInputElement>(null)
  const deleted = inTrash(id)
  const [more, setMore] = useState(false)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight,
        ListTabs,
        Placeholder.configure({ placeholder: 'Write…' }),
        Collaboration.configure({
          document: doc,
          field: 'content',
          yUndoOptions: { undoManager: undoManagerFor(id, doc) },
        }),
        CollaborationCaret.configure({
          provider: { awareness: getAwareness(id) },
          user: { name: s.me!.name, color: caretColor(s.me!.id) },
        }),
      ],
      editorProps: { attributes: { class: 'editor-body' } },
    },
    [doc],
  )

  // A trashed note can be read but not edited until it is restored.
  useEffect(() => {
    editor?.setEditable(!deleted)
  }, [editor, deleted])

  // Opening a note means writing in it: an empty title first, otherwise where this device left the
  // cursor, or the end of the text.
  useEffect(() => {
    if (!editor || deleted) return
    if (!titleRef.current?.value) {
      titleRef.current?.focus()
      return
    }
    const { binding } = ySyncPluginKey.getState(editor.state)!
    const saved = localStorage.getItem(`cursor:${id}`)
    const pos = saved
      ? relativePositionToAbsolutePosition(doc, binding.type, Y.createRelativePositionFromJSON(JSON.parse(saved)), binding.mapping)
      : null
    editor.commands.focus(pos ?? 'end')
  }, [editor, deleted, id, doc])

  // Anchored to the text, so someone else's edit above the cursor doesn't move where it reopens.
  useEffect(() => {
    if (!editor) return
    const save = () => {
      const { binding } = ySyncPluginKey.getState(editor.state)!
      const pos = absolutePositionToRelativePosition(editor.state.selection.from, binding.type, binding.mapping)
      localStorage.setItem(`cursor:${id}`, JSON.stringify(Y.relativePositionToJSON(pos)))
    }
    editor.on('selectionUpdate', save)
    return () => {
      editor.off('selectionUpdate', save)
    }
  }, [editor, id])

  if (!getDoc(id)) return <p className="m-auto text-ink-muted">This note is no longer shared with you.</p>

  const mine = isMine(id)
  const toBody = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      editor?.commands.focus('start')
    }
  }
  const leave = () => navigate('/')
  const pinLabel = isPinned(id) ? 'Unpin' : 'Pin'
  const removeLabel = mine ? 'Delete' : 'Leave'
  const remove = () => {
    if (mine) deleteNote(id)
    else leaveNote(id)
    leave()
  }
  const back = (
    <button type="button" className="px-2 py-1 text-xl md:hidden" onClick={leave} aria-label="Back">
      ←
    </button>
  )

  const sharedBy = !mine && <span className="shrink-0 text-sm text-ink-muted">Shared by {ownerName(id)}</span>
  // On a phone the title needs the width, so the action row drops under it and the dots reveal it.
  const phoneControls = (
    <>
      {(!mine || shareCount(id) > 0) && (
        <span role="img" aria-label="Shared" title="Shared" className="shrink-0 text-ink-muted md:hidden">
          <UsersIcon />
        </span>
      )}
      <button
        type="button"
        aria-label="More"
        aria-expanded={more}
        className="h-10 w-10 shrink-0 text-2xl leading-none md:hidden"
        onClick={() => setMore(!more)}
      >
        ⋯
      </button>
    </>
  )
  const actionRow = `${more ? 'flex' : 'hidden'} w-full items-center justify-end gap-2 md:flex md:w-auto`

  if (deleted) {
    const canAct = mine || hasLeft(id)
    const final = mine ? 'Delete forever' : 'Leave for good'
    const purge = () => {
      void purgeNote(id)
      leave()
    }
    return (
      <>
        <header className="flex flex-wrap items-center gap-2 border-b-2 border-border bg-surface px-3 py-2">
          {back}
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{titleOf(id)}</span>
          <OfflineIcon />
          {phoneControls}
          <div className={actionRow}>
            {sharedBy}
            {canAct && (
              <>
                <Button onClick={() => restoreNote(id)}>Restore</Button>
                <Button disabled={!s.online} onClick={purge}>
                  {final}
                </Button>
              </>
            )}
          </div>
        </header>
        {/* Sunken and muted: readable, clearly not for writing. */}
        <EditorContent editor={editor} className="flex-1 overflow-y-auto bg-sunken text-ink-muted" />
      </>
    )
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-border bg-surface px-3 py-2">
        {back}
        <input
          ref={titleRef}
          className="min-w-0 flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-ink-muted"
          placeholder="Title"
          value={(meta.get('title') as string | undefined) ?? ''}
          onChange={(e) => meta.set('title', e.target.value)}
          onKeyDown={toBody}
        />
        <OfflineIcon />
        {phoneControls}
        <div className={actionRow}>
          {mine ? <ShareDialog id={id} /> : sharedBy}
          <IconButton label={pinLabel} onClick={() => togglePin(id)}>
            <PinIcon filled={isPinned(id)} className={`h-[22px] w-[22px] ${isPinned(id) ? 'text-accent' : ''}`} />
          </IconButton>
          <IconButton label={removeLabel} onClick={remove}>
            {mine ? <TrashIcon /> : <LeaveIcon />}
          </IconButton>
        </div>
      </header>
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
      <Toolbar editor={editor} />
    </>
  )
}
