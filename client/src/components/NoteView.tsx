import Collaboration from '@tiptap/extension-collaboration'
import DragHandle from '@tiptap/extension-drag-handle-react'
import { Placeholder } from '@tiptap/extensions'
import { Plugin } from '@tiptap/pm/state'
import { EditorContent, Extension, useEditor, useEditorState } from '@tiptap/react'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { useDoc, useStore, useY } from '../sync/hooks'
import { getAwareness, getDoc } from '../sync/store'
import {
  children,
  hasLeft,
  inTrash,
  isMine,
  isPinned,
  nodes,
  ownerName,
  purgeNote,
  removeNote,
  restoreNote,
  setColor,
  shareCount,
  titleOf,
  togglePin,
} from '../sync/tree'
import { Button, IconButton } from './Button'
import {
  ArrowRightIcon,
  CheckedIcon,
  DeleteWhenCheckedIcon,
  GripIcon,
  HideCheckedIcon,
  LeaveIcon,
  PaletteIcon,
  PinIcon,
  RemoveNoteIcon,
  RemoveWithNotesIcon,
  SharedWithMeIcon,
  TrashIcon,
  UncheckAllIcon,
  UsersIcon,
} from './icons'
import { contentExtensions } from './content'
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
  uncheckAll,
} from './lists'
import { TableEnter } from './tables'
import { THEMES } from './themes'
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

// Other people's carets, each with its name, only while that person moves it. One still for a few seconds goes,
// so a device left open elsewhere doesn't leave a caret in the text. A state that only just arrived isn't a move.
const Carets = (awareness: Awareness, user: { name: string; color: string }) =>
  Extension.create({
    name: 'carets',
    addProseMirrorPlugins() {
      const moving = new Map<number, number>()
      return [
        yCursorPlugin(awareness, {
          awarenessStateFilter: (mine, client) => client !== mine && moving.has(client),
          cursorBuilder: ({ name, color }) => {
            const caret = document.createElement('span')
            caret.className = 'collaboration-carets__caret'
            caret.style.borderColor = color
            const label = document.createElement('div')
            label.className = 'collaboration-carets__label'
            label.style.backgroundColor = color
            label.textContent = name
            caret.append(label)
            return caret
          },
        }),
        new Plugin({
          view: (view) => {
            const redraw = () => view.isDestroyed || view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
            const moved = ({ updated }: { updated: number[] }) => {
              const others = updated.filter((client) => client !== awareness.clientID)
              for (const client of others) {
                clearTimeout(moving.get(client))
                const timer = window.setTimeout(() => {
                  moving.delete(client)
                  redraw()
                }, 5000)
                moving.set(client, timer)
              }
              if (others.length > 0) redraw()
            }
            awareness.setLocalStateField('user', user)
            awareness.on('change', moved)
            return {
              destroy: () => {
                awareness.off('change', moved)
                for (const timer of moving.values()) clearTimeout(timer)
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
  // New with every link that opens this note, so a link to the note already open still goes to its line.
  const { key: visit } = useLocation()
  const meta = doc.getMap('meta')
  useY(meta)
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
  // One box opens under the title at a time: the folded actions, what to do with checked lines, whether the notes
  // under this one go with it, or the note's color.
  const [panel, setPanel] = useState<'more' | 'checked' | 'remove' | 'color' | null>(null)

  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions,
        ListTabs,
        TableEnter,
        JoinLists,
        LineGrips(id),
        Placeholder.configure({ placeholder: 'Write…' }),
        HideChecked(() => meta.get('hideChecked') === true || meta.get('deleteChecked') === true),
        Collaboration.configure({
          document: doc,
          field: 'content',
          yUndoOptions: { undoManager: undoManagerFor(id, doc) },
        }),
        // A family goes by first names, and a guest by the whole made-up one.
        Carets(getAwareness(id), {
          name: s.me!.guest ? s.me!.name : s.me!.name.split(' ')[0],
          color: caretColor(s.me!.id),
        }),
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

  // Delete checked shows hidden checked lines on this device for a moment first, so you see what goes.
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    if (!clearing || !editor) return
    const timer = setTimeout(() => {
      deleteChecked(editor)
      setClearing(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [clearing, editor])

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
  }, [editor, deleted, id, doc, visit])

  // A phone raises the keyboard for a tap, not for a note a widget opened in the running app, so we ask for it.
  // Chrome says no on a page nobody has tapped since it loaded.
  useEffect(() => {
    const focused = document.activeElement
    const keyboard = (navigator as Navigator & { virtualKeyboard?: { show(): void } }).virtualKeyboard
    if (!editor || deleted || !(focused instanceof HTMLElement) || !keyboard) return
    focused.setAttribute('virtualkeyboardpolicy', 'manual')
    keyboard.show()
    // Back to the default once Chrome has acted on it, so a later tap raises the keyboard as usual.
    setTimeout(() => focused.removeAttribute('virtualkeyboardpolicy'), 300)
  }, [editor, deleted, id, visit])

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
    const shown = header.current?.querySelector<HTMLElement>('[data-title]')
    if (folded || !shown) return
    // Actions too wide for the row wrap under the title, which then looks as if it had room.
    const wrapped = (header.current!.lastElementChild as HTMLElement).offsetTop >= shown.offsetTop + shown.offsetHeight
    if (wrapped || shown.scrollWidth > shown.clientWidth) setFolded(true)
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
  const remove = (withNotes: boolean) => {
    void removeNote(id, withNotes)
    leave()
  }
  const nested = children(id).length > 0
  const removeChoices = (
    <>
      <IconButton label="Just this note" onClick={() => remove(false)}>
        <RemoveNoteIcon />
      </IconButton>
      <IconButton label="With its notes" onClick={() => remove(true)}>
        <RemoveWithNotesIcon />
      </IconButton>
    </>
  )
  const back = (
    <button type="button" className="px-2 py-1 text-xl md:hidden" onClick={leave} aria-label="Back">
      ←
    </button>
  )

  // The note's color for this person alone. Automatic follows the color scheme.
  const picked = nodes().get(id)?.color
  const colors = (
    <div className="grid w-[min(calc(100vw-2rem),20rem)] grid-cols-8 gap-2 p-1">
      <button
        type="button"
        aria-label="Automatic color"
        aria-pressed={!picked}
        title="Automatic color"
        className={`row-span-2 border-2 border-border bg-surface text-ink ${picked ? '' : 'outline-2 outline-offset-2 outline-ink'}`}
        onClick={() => setColor(id, undefined)}
      >
        <svg viewBox="0 0 10 10" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <path d="M0 10L10 0" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </button>
      {THEMES.map(({ name, color }) => (
        <button
          key={color}
          type="button"
          aria-label={name}
          aria-pressed={color === picked}
          title={name}
          className={`aspect-square border-2 border-border ${color === picked ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
          style={{ background: color }}
          onClick={() => setColor(id, color)}
        />
      ))}
    </div>
  )

  // Someone else's note wears this where the owner has Share, and behind the dots there is room for the name.
  const sharedBy = !mine && (
    <span role="img" aria-label={`Shared by ${ownerName(id)}`} title={`Shared by ${ownerName(id)}`} className="shrink-0 text-ink-muted">
      <SharedWithMeIcon />
    </span>
  )
  // Every action folds at once, except Share or its stand-in, which stays beside the dots. Elsewhere a people icon
  // stays there when the note is shared. Behind the dots, the checked-line options and the choice of what to delete
  // get their own rows instead of a box inside the box.
  const actions = (share: React.ReactNode, buttons: React.ReactNode, checked?: React.ReactNode, choices?: React.ReactNode) =>
    folded ? (
      <>
        {share ||
          sharedBy ||
          (shareCount(id) > 0 && (
            <span role="img" aria-label="Shared" title="Shared" className="shrink-0 text-ink-muted">
              <UsersIcon />
            </span>
          ))}
        <Popover
          side="bottom"
          open={panel === 'more' || panel === 'remove' || panel === 'color'}
          onOpenChange={(open) => setPanel(open ? 'more' : null)}
          trigger={
            <button type="button" aria-label="More" className="h-10 w-10 shrink-0 text-2xl leading-none">
              ⋯
            </button>
          }
        >
          <div className="flex flex-col items-end gap-2">
            {checked && <div className="flex items-center gap-2">{checked}</div>}
            <div className="flex items-center gap-2">
              {!mine && <span className="shrink-0 text-sm text-ink-muted">Shared by {ownerName(id)}</span>}
              {buttons}
            </div>
            {(panel === 'remove' || panel === 'color') && <div className="flex items-center gap-2">{choices}</div>}
          </div>
        </Popover>
      </>
    ) : (
      <div className="flex items-center justify-end gap-2">
        {share}
        {sharedBy}
        {checked && (
          <Popover
            side="bottom"
            open={panel === 'checked'}
            onOpenChange={(open) => setPanel(open ? 'checked' : null)}
            trigger={
              <IconButton label="Checked lines">
                <CheckedIcon />
              </IconButton>
            }
          >
            {checked}
          </Popover>
        )}
        {buttons}
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
        <header
          ref={header}
          className="note-header flex flex-wrap items-center gap-2 border-b-2 border-border bg-accent px-3 py-2 text-on-accent"
        >
          {back}
          <span data-title className="min-w-0 flex-1 truncate text-lg font-bold">
            {titleOf(id)}
          </span>
          <OfflineIcon />
          {actions(
            null,
            canAct && (
              <>
                <Button onClick={() => restoreNote(id)}>Restore</Button>
                <Button disabled={!s.online} onClick={purge}>
                  {final}
                </Button>
              </>
            ),
          )}
        </header>
        {/* Sunken and muted: readable, clearly not for writing. */}
        <EditorContent editor={editor} className="flex-1 overflow-y-auto bg-sunken text-ink-muted" />
      </>
    )
  }

  return (
    <>
      <header
        ref={header}
        className="note-header flex flex-wrap items-center gap-2 border-b-2 border-border bg-accent px-3 py-2 text-on-accent"
      >
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
            {folded ? (
              <IconButton label="Note color" onClick={() => setPanel(panel === 'color' ? 'more' : 'color')}>
                <PaletteIcon />
              </IconButton>
            ) : (
              <Popover
                side="bottom"
                open={panel === 'color'}
                onOpenChange={(open) => setPanel(open ? 'color' : null)}
                trigger={
                  <IconButton label="Note color">
                    <PaletteIcon />
                  </IconButton>
                }
              >
                {colors}
              </Popover>
            )}
            <IconButton label={pinLabel} onClick={() => togglePin(id)}>
              <PinIcon filled={isPinned(id)} className={`h-[22px] w-[22px] ${isPinned(id) ? 'text-accent-ink' : ''}`} />
            </IconButton>
            {nested && !folded ? (
              <Popover
                side="bottom"
                open={panel === 'remove'}
                onOpenChange={(open) => setPanel(open ? 'remove' : null)}
                trigger={
                  <IconButton label={removeLabel} className={panel === 'remove' ? 'text-accent-ink' : ''}>
                    {mine ? <TrashIcon /> : <LeaveIcon />}
                  </IconButton>
                }
              >
                {removeChoices}
              </Popover>
            ) : (
              <IconButton
                label={removeLabel}
                className={panel === 'remove' ? 'text-accent-ink' : ''}
                onClick={() => (nested ? setPanel(panel === 'remove' ? 'more' : 'remove') : remove(false))}
              >
                {mine ? <TrashIcon /> : <LeaveIcon />}
              </IconButton>
            )}
          </>,
          tasks?.any && editor && (
            <>
              <IconButton
                label="Hide checked"
                aria-pressed={hiding && !deleting}
                onClick={() => setMode('hideChecked', !(hiding && !deleting))}
              >
                <HideCheckedIcon className={`h-[22px] w-[22px] ${hiding && !deleting ? 'text-accent-ink' : ''}`} />
              </IconButton>
              <IconButton label="Delete when checked" aria-pressed={deleting} onClick={() => setMode('deleteChecked', !deleting)}>
                <DeleteWhenCheckedIcon className={`h-[22px] w-[22px] ${deleting ? 'text-accent-ink' : ''}`} />
              </IconButton>
              {tasks.checked && (
                <>
                  <IconButton label="Uncheck all" onClick={() => uncheckAll(editor)}>
                    <UncheckAllIcon />
                  </IconButton>
                  {/* Spelled out in icons, checked lines into the trash, so it can't be taken for Delete when checked. */}
                  <IconButton
                    label="Delete checked"
                    className="px-1"
                    onClick={() => (hiding ? setClearing(true) : deleteChecked(editor))}
                  >
                    <CheckedIcon />
                    <ArrowRightIcon className="h-4 w-4" />
                    <TrashIcon />
                  </IconButton>
                </>
              )}
            </>
          ),
          panel === 'color' ? colors : removeChoices,
        )}
      </header>
      <EditorContent
        editor={editor}
        className="relative flex-1 overflow-y-auto bg-surface"
        data-hide-checked={(hiding && !clearing) || undefined}
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
          className={`drag-handle flex h-8 w-6 cursor-grab items-center justify-center text-ink-muted hover:text-accent-ink ${onList ? 'invisible!' : ''}`}
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
