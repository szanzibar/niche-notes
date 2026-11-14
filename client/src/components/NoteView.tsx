import Collaboration from '@tiptap/extension-collaboration'
import DragHandle from '@tiptap/extension-drag-handle-react'
import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Plugin } from '@tiptap/pm/state'
import { EditorContent, Extension, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  yCursorPlugin,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Awareness } from 'y-protocols/awareness'
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
import {
  CheckedIcon,
  DeleteWhenCheckedIcon,
  GripIcon,
  HideCheckedIcon,
  LeaveIcon,
  PinIcon,
  TrashIcon,
  UncheckAllIcon,
  UsersIcon,
} from './icons'
import { OfflineIcon } from './OfflineIcon'
import { Popover } from './Popover'
import { ShareDialog } from './ShareDialog'
import {
  deleteChecked,
  dragByTouch,
  HideChecked,
  inList,
  JoinLists,
  LineGrips,
  ListTabs,
  moveLine,
  TaskItem,
  uncheckAll,
} from './lists'
import { MoveDialog } from './MoveDialog'
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

// Other people's carets. Each one's name shows while that device moves its cursor and fades once it has been still
// for a few seconds, so a name doesn't sit over the text for good.
const Carets = (awareness: Awareness, user: { name: string; color: string }) =>
  Extension.create({
    name: 'carets',
    addProseMirrorPlugins() {
      const labels = new Map<number, HTMLElement>()
      const active = new Map<number, number>()
      const moved = ({ added, updated }: { added: number[]; updated: number[] }) => {
        for (const client of [...added, ...updated]) {
          clearTimeout(active.get(client))
          labels.get(client)?.removeAttribute('data-idle')
          const timer = window.setTimeout(() => {
            active.delete(client)
            labels.get(client)?.setAttribute('data-idle', '')
          }, 5000)
          active.set(client, timer)
        }
      }
      return [
        yCursorPlugin(awareness, {
          cursorBuilder: ({ name, color }, client) => {
            const caret = document.createElement('span')
            caret.className = 'collaboration-carets__caret'
            caret.style.borderColor = color
            const label = document.createElement('div')
            label.className = 'collaboration-carets__label'
            label.style.backgroundColor = color
            label.textContent = name
            label.toggleAttribute('data-idle', !active.has(client))
            caret.append(label)
            labels.set(client, label)
            return caret
          },
        }),
        new Plugin({
          view: () => {
            awareness.setLocalStateField('user', user)
            awareness.on('change', moved)
            return {
              destroy: () => {
                awareness.off('change', moved)
                for (const timer of active.values()) clearTimeout(timer)
              },
            }
          },
        }),
      ]
    },
  })

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
  // One way to treat checked lines at a time. If two devices pick both at once, delete wins, and it hides too.
  const deleting = meta.get('deleteChecked') === true
  const hiding = deleting || meta.get('hideChecked') === true
  const setMode = (mode: 'hideChecked' | 'deleteChecked', on: boolean) =>
    doc.transact(() => {
      meta.set('hideChecked', on && mode === 'hideChecked')
      meta.set('deleteChecked', on && mode === 'deleteChecked')
    })
  // One box opens under the title at a time: the folded actions, or what to do with checked lines.
  const [panel, setPanel] = useState<'more' | 'checked' | null>(null)

  const editor = useEditor(
    {
      extensions: [
        // A tap on a link places the cursor to edit it, and the toolbar shows the address to open it.
        StarterKit.configure({
          undoRedo: false,
          dropcursor: { color: 'var(--accent)', width: 3 },
          link: { openOnClick: false },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Highlight,
        ListTabs,
        JoinLists,
        LineGrips(id),
        Placeholder.configure({ placeholder: 'Write…' }),
        HideChecked(() => meta.get('hideChecked') === true || meta.get('deleteChecked') === true),
        Collaboration.configure({
          document: doc,
          field: 'content',
          yUndoOptions: { undoManager: undoManagerFor(id, doc) },
        }),
        Carets(getAwareness(id), { name: s.me!.name, color: caretColor(s.me!.id) }),
      ],
      editorProps: { attributes: { class: 'editor-body' } },
    },
    [doc],
  )

  const tasks = useEditorState({
    editor,
    selector: ({ editor }) => {
      const found = { any: false, checked: false }
      editor?.state.doc.descendants((node) => {
        if (node.type.name !== 'taskItem') return
        found.any = true
        found.checked ||= node.attrs.checked
      })
      return found
    },
  })

  // List lines have their own grips, so the floating handle stays off them. It stays laid out while unseen, since
  // it measures where to go even then.
  const [onList, setOnList] = useState(false)
  // The line whose grip was tapped, until a note is picked for it.
  const [moving, setMoving] = useState<(() => number | undefined) | null>(null)
  useEffect(() => {
    if (!editor) return
    const ask = (e: Event) => setMoving(() => (e as CustomEvent<() => number | undefined>).detail)
    const dom = editor.view.dom
    dom.addEventListener('move-line', ask)
    return () => dom.removeEventListener('move-line', ask)
  }, [editor])

  // Lines ticked while the note is open stay, hidden, until it opens again. Someone ticking in it right then
  // loses the line a moment early.
  useEffect(() => {
    if (editor && !deleted && meta.get('deleteChecked') === true) deleteChecked(editor)
  }, [editor, deleted, meta])

  // A trashed note can be read but not edited until it is restored.
  useEffect(() => {
    editor?.setEditable(!deleted)
  }, [editor, deleted])

  // Opening a note means writing in it: an empty title first, otherwise where this device left the
  // cursor, or the end of the text. A link from a calendar event or a widget line names its line instead. A line
  // that reaches this device only after the note opens isn't found, so the note opens as usual.
  useEffect(() => {
    if (!editor || deleted) return
    const line = new URLSearchParams(location.search).get('line')
    let end: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (end == null && line && node.isTextblock && node.textContent === line) end = pos + node.nodeSize - 1
      return end == null
    })
    if (end != null) {
      editor.commands.focus(end)
      return
    }
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

  // The actions sit beside the title until it would be cut off. Then they fold behind the dots, which
  // reveal them under the title. Each check lays them out beside it first, before anything is drawn.
  const header = useRef<HTMLElement>(null)
  const [folded, setFolded] = useState(false)
  const [width, setWidth] = useState(window.innerWidth)
  const title = meta.get('title')
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useLayoutEffect(() => setFolded(false), [title, width, tasks, deleted, s.online])
  useLayoutEffect(() => {
    const shown = header.current?.querySelector('[data-title]')
    if (!folded && shown && shown.scrollWidth > shown.clientWidth) setFolded(true)
  }, [folded, title, width, tasks, deleted, s.online])

  if (!getDoc(id)) return <p className="m-auto text-ink-muted">This note is no longer shared with you.</p>

  const mine = isMine(id)
  const toBody = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      editor?.commands.focus('start')
    }
  }
  // The list is always the page under a note.
  const leave = () => navigate(-1)
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
  // Every action folds at once, except Share, which stays beside the dots. Elsewhere a people icon stays there
  // when the note is shared. Behind the dots, the checked-line options get their own row instead of a box inside
  // the box.
  const actions = (share: React.ReactNode, children: React.ReactNode, checked?: React.ReactNode) =>
    folded ? (
      <>
        {share ||
          ((!mine || shareCount(id) > 0) && (
            <span role="img" aria-label="Shared" title="Shared" className="shrink-0 text-ink-muted">
              <UsersIcon />
            </span>
          ))}
        <Popover
          side="bottom"
          open={panel === 'more'}
          onOpenChange={(open) => setPanel(open ? 'more' : null)}
          trigger={
            <button type="button" aria-label="More" className="h-10 w-10 shrink-0 text-2xl leading-none">
              ⋯
            </button>
          }
        >
          <div className="flex flex-col items-end gap-2">
            {checked && <div className="flex items-center gap-2">{checked}</div>}
            <div className="flex items-center gap-2">{children}</div>
          </div>
        </Popover>
      </>
    ) : (
      <div className="flex items-center justify-end gap-2">
        {checked && (
          <Popover
            side="bottom"
            open={panel === 'checked'}
            onOpenChange={(open) => setPanel(open ? 'checked' : null)}
            trigger={
              <IconButton label="Checked lines">
                <CheckedIcon className={`h-[22px] w-[22px] ${panel === 'checked' || hiding ? 'text-accent' : ''}`} />
              </IconButton>
            }
          >
            {checked}
          </Popover>
        )}
        {share}
        {children}
      </div>
    )

  if (deleted) {
    const canAct = mine || hasLeft(id)
    const final = mine ? 'Delete forever' : 'Leave for good'
    const purge = () => {
      void purgeNote(id)
      leave()
    }
    return (
      <>
        <header ref={header} className="flex flex-wrap items-center gap-2 border-b-2 border-border bg-surface px-3 py-2">
          {back}
          <span data-title className="min-w-0 flex-1 truncate text-lg font-bold">
            {titleOf(id)}
          </span>
          <OfflineIcon />
          {actions(
            null,
            <>
              {sharedBy}
              {canAct && (
                <>
                  <Button onClick={() => restoreNote(id)}>Restore</Button>
                  <Button disabled={!s.online} onClick={purge}>
                    {final}
                  </Button>
                </>
              )}
            </>,
          )}
        </header>
        {/* Sunken and muted: readable, clearly not for writing. */}
        <EditorContent editor={editor} className="flex-1 overflow-y-auto bg-sunken text-ink-muted" />
      </>
    )
  }

  return (
    <>
      <header ref={header} className="flex flex-wrap items-center gap-2 border-b-2 border-border bg-surface px-3 py-2">
        {back}
        <input
          ref={titleRef}
          data-title
          className="min-w-0 flex-1 truncate bg-transparent text-lg font-bold outline-none placeholder:text-ink-muted"
          placeholder="Title"
          value={(meta.get('title') as string | undefined) ?? ''}
          onChange={(e) => meta.set('title', e.target.value)}
          onKeyDown={toBody}
        />
        <OfflineIcon />
        {actions(
          mine && <ShareDialog id={id} />,
          <>
            {sharedBy}
            <IconButton label={pinLabel} onClick={() => togglePin(id)}>
              <PinIcon filled={isPinned(id)} className={`h-[22px] w-[22px] ${isPinned(id) ? 'text-accent' : ''}`} />
            </IconButton>
            <IconButton label={removeLabel} onClick={remove}>
              {mine ? <TrashIcon /> : <LeaveIcon />}
            </IconButton>
          </>,
          tasks?.any && editor && (
            <>
              <IconButton
                label="Hide checked"
                aria-pressed={hiding && !deleting}
                onClick={() => setMode('hideChecked', !(hiding && !deleting))}
              >
                <HideCheckedIcon className={`h-[22px] w-[22px] ${hiding && !deleting ? 'text-accent' : ''}`} />
              </IconButton>
              <IconButton label="Delete when checked" aria-pressed={deleting} onClick={() => setMode('deleteChecked', !deleting)}>
                <DeleteWhenCheckedIcon className={`h-[22px] w-[22px] ${deleting ? 'text-accent' : ''}`} />
              </IconButton>
              {tasks.checked && (
                <IconButton label="Uncheck all" onClick={() => uncheckAll(editor)}>
                  <UncheckAllIcon />
                </IconButton>
              )}
            </>
          ),
        )}
      </header>
      <EditorContent
        editor={editor}
        className="relative flex-1 overflow-y-auto"
        data-hide-checked={hiding || undefined}
      />
      {editor && moving && (
        <MoveDialog
          note={id}
          onClose={() => setMoving(null)}
          onPick={(to) => {
            void moveLine(editor, moving, id, to)
            setMoving(null)
          }}
        />
      )}
      {editor && (
        // Pointing at a heading or paragraph shows its handle, and dragging the handle moves it. List lines have
        // their own grips. By default a pointer near a nested block's left edge picks its parent.
        <DragHandle
          editor={editor}
          nested={{ edgeDetection: 'none' }}
          onNodeChange={({ node, pos }) => setOnList(node != null && inList(editor.state.doc, pos))}
          className={`drag-handle flex h-8 w-6 cursor-grab items-center justify-center text-ink-muted hover:text-accent ${onList ? 'invisible!' : ''}`}
        >
          <span ref={dragByTouch} className="flex h-full w-full items-center justify-center">
            <GripIcon className="h-5 w-5" />
          </span>
        </DragHandle>
      )}
      <Toolbar editor={editor} />
    </>
  )
}
