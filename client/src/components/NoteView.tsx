import Collaboration from '@tiptap/extension-collaboration'
import DragHandle from '@tiptap/extension-drag-handle-react'
import { Placeholder } from '@tiptap/extensions'
import { Plugin } from '@tiptap/pm/state'
import { EditorContent, Extension, type Editor as TipTapEditor, useEditor, useEditorState } from '@tiptap/react'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  yCursorPlugin,
  yCursorPluginKey,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import { useEffect, useRef, useState } from 'react'
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
  people,
  purgeNote,
  readOnly,
  removeNote,
  restoreNote,
  setColor,
  titleOf,
  togglePin,
} from '../sync/tree'
import { Button, IconButton, MenuItem } from './Button'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  GripIcon,
  HistoryIcon,
  LeaveIcon,
  MoreIcon,
  PaletteIcon,
  PinIcon,
  RemoveNoteIcon,
  RemoveWithNotesIcon,
  SearchIcon,
  TrashIcon,
  UncheckAllIcon,
  UsersIcon,
  ViewIcon,
} from './icons'
import { contentExtensions } from './content'
import { find, FindInNote } from './find'
import { History } from './History'
import { OfflineIcon } from './OfflineIcon'
import { Popover } from './Popover'
import { ShareDialog } from './ShareDialog'
import {
  Assignees,
  deleteChecked,
  dragByTouch,
  HideChecked,
  inList,
  JoinLists,
  LineGrips,
  ListTabs,
  uncheckAll,
} from './lists'
import { TableEnter } from './tables'
import { THEMES } from './themes'
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
  // A guest has the note's text and nothing of the app around it, so not even its title to change.
  const guest = s.me!.guest
  const reading = readOnly(id)
  const locked = deleted || reading
  // One way to treat checked lines at a time. If two devices pick both at once, delete wins, and it hides too.
  const deleting = meta.get('deleteChecked') === true
  const hiding = deleting || meta.get('hideChecked') === true
  const setMode = (mode: 'hideChecked' | 'deleteChecked', on: boolean) =>
    doc.transact(() => {
      meta.set('hideChecked', on && mode === 'hideChecked')
      meta.set('deleteChecked', on && mode === 'deleteChecked')
    })
  // The menu, opened on its own, on the note's colors, on whether the notes under this one go with it, or as the
  // find box.
  const [panel, setPanel] = useState<'menu' | 'color' | 'remove' | 'find' | null>(null)
  const hidingChecked = () => meta.get('hideChecked') === true || meta.get('deleteChecked') === true
  const [history, setHistory] = useState(false)

  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions,
        ListTabs,
        TableEnter,
        JoinLists,
        LineGrips,
        Placeholder.configure({ placeholder: 'Write…' }),
        HideChecked(hidingChecked),
        Assignees(() => people(id)),
        FindInNote(hidingChecked),
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
      // Android's WebView checks spelling only where the page asks for it.
      editorProps: { attributes: { class: 'editor-body', spellcheck: 'true' } },
    },
    [doc],
  )
  // A line's name redraws once the note's people arrive or change, not only on the next edit.
  const named = people(id)
    .map((u) => u.id + u.name)
    .join()
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr)
  }, [editor, named])

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
    if (editor && !locked && meta.get('deleteChecked') === true) deleteChecked(editor)
  }, [editor, locked, meta])

  // A trashed note can be read but not edited until it is restored.
  useEffect(() => {
    editor?.setEditable(!locked)
  }, [editor, locked])

  // Opening a note means writing in it: an empty title first, otherwise where this device left the
  // cursor, or the end of the text. A link from a calendar event or a widget line names its line instead. A line
  // edited since, or that reaches this device only after the note opens, isn't found, so the note opens as usual.
  useEffect(() => {
    if (!editor || locked) return
    const line = new URLSearchParams(location.search).get('line')
    let end: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (end == null && line && node.isTextblock && node.textContent === line) end = pos + node.nodeSize - 1
      return end == null
    })
    if (end == null && titleRef.current && !titleRef.current.value) {
      titleRef.current.focus()
      return
    }
    if (end == null) {
      const { binding } = ySyncPluginKey.getState(editor.state)!
      const saved = localStorage.getItem(`cursor:${id}`)
      end = saved
        ? relativePositionToAbsolutePosition(doc, binding.type, Y.createRelativePositionFromJSON(JSON.parse(saved)), binding.mapping)
        : null
    }
    editor.commands.setTextSelection(end ?? editor.state.doc.content.size)
    // ProseMirror's own focus puts the cursor in the page at once. TipTap's leaves the browser's caret at the start on
    // Android for a moment, and the cursor jumps there if anything on the page changes meanwhile.
    editor.view.focus()
    const center = () => {
      const { node } = editor.view.domAtPos(editor.state.selection.head)
      const element = node instanceof Element ? node : node.parentElement
      element?.scrollIntoView({ block: 'center' })
    }
    center()
    // A widget's keyboard comes up a moment later and shortens the page from the bottom, so the cursor centers again.
    addEventListener('resize', center)
    const settled = setTimeout(() => removeEventListener('resize', center), 1000)
    return () => {
      clearTimeout(settled)
      removeEventListener('resize', center)
    }
  }, [editor, locked, id, doc, visit])

  // A phone raises the keyboard for a tap, not for a note a widget opened in the running app, so we ask for it.
  // Chrome says no on a page nobody has tapped since it loaded.
  useEffect(() => {
    const focused = document.activeElement
    const keyboard = (navigator as Navigator & { virtualKeyboard?: { show(): void } }).virtualKeyboard
    if (!editor || locked || !(focused instanceof HTMLElement) || !keyboard) return
    focused.setAttribute('virtualkeyboardpolicy', 'manual')
    keyboard.show()
    // Back to the default once Chrome has acted on it, so a later tap raises the keyboard as usual.
    setTimeout(() => focused.removeAttribute('virtualkeyboardpolicy'), 300)
  }, [editor, locked, id, visit])

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

  // Ctrl or ⌘ and F find in the note rather than the page.
  const findField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (guest || deleted || history) return
    const open = (e: KeyboardEvent) => {
      if (e.key !== 'f' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setPanel('find')
      findField.current?.focus()
      findField.current?.select()
    }
    addEventListener('keydown', open)
    return () => removeEventListener('keydown', open)
  }, [guest, deleted, history])

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
  const remove = (withNotes: boolean) => {
    void removeNote(id, withNotes)
    leave()
  }
  const under = (parent: string): string[] => children(parent).flatMap((kid) => [kid, ...under(kid)])
  const nested = under(id).length
  const back = !guest && (
    <IconButton label="Back" className="-ml-2 md:hidden" onClick={leave}>
      <ChevronLeftIcon />
    </IconButton>
  )
  // Someone else's note names its owner where the owner has Share, as the tree does.
  const owner = !guest && !mine && (
    <span
      role="img"
      aria-label={`Shared by ${ownerName(id)}${reading ? ', view only' : ''}`}
      title={`Shared by ${ownerName(id)}${reading ? ', view only' : ''}`}
      className="flex shrink-0 items-center gap-1.5 font-bold"
    >
      {reading ? <ViewIcon /> : <UsersIcon filled />}
      {ownerName(id)}
    </span>
  )
  const title = (
    <span data-title className="min-w-0 flex-1 truncate text-lg font-bold">
      {titleOf(id)}
    </span>
  )

  if (deleted) {
    const purge = () => {
      void purgeNote(id)
      leave()
    }
    return (
      <>
        <header className="note-header flex items-center gap-2 border-b-2 border-border bg-accent px-3 py-2 text-on-accent">
          {back}
          {title}
          {!guest && <OfflineIcon />}
          {owner}
          {(mine || hasLeft(id)) && (
            <>
              <Button onClick={() => restoreNote(id)}>Restore</Button>
              <Button disabled={!s.online} onClick={purge}>
                {mine ? 'Delete forever' : 'Leave for good'}
              </Button>
            </>
          )}
        </header>
        {/* Sunken and muted: readable, clearly not for writing. */}
        <EditorContent editor={editor} className="flex-1 overflow-y-auto bg-sunken text-ink-muted" />
      </>
    )
  }

  // The note's color for this person alone. Automatic follows the color scheme.
  const picked = nodes().get(id)?.color
  const close = (act: () => void) => {
    act()
    setPanel(null)
  }
  const menu = (
    <Popover
      side="bottom"
      open={panel != null}
      onOpenChange={(open) => setPanel(open ? 'menu' : null)}
      className={panel === 'find' ? 'w-[min(calc(100vw-1rem),24rem)]' : ''}
      trigger={
        <IconButton label="More" className="-mr-1">
          <MoreIcon />
        </IconButton>
      }
    >
      {panel === 'find' && editor && <FindBox editor={editor} field={findField} onClose={() => setPanel(null)} />}
      <div hidden={panel === 'find'} className="flex w-64 flex-col">
        <MenuItem icon={<SearchIcon />} onClick={() => setPanel('find')}>
          Find in note
        </MenuItem>
        <MenuItem icon={<PaletteIcon />} aria-expanded={panel === 'color'} onClick={() => setPanel(panel === 'color' ? 'menu' : 'color')}>
          Color
        </MenuItem>
        {panel === 'color' && (
          <div className="grid grid-cols-5 gap-2 p-2">
            <button
              type="button"
              aria-label="Automatic color"
              aria-pressed={!picked}
              title="Automatic color"
              className={`aspect-square border-2 border-border bg-surface text-ink ${picked ? '' : 'outline-2 outline-offset-2 outline-ink'}`}
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
        )}
        <MenuItem icon={<PinIcon filled={isPinned(id)} />} onClick={() => close(() => togglePin(id))}>
          {isPinned(id) ? 'Unpin' : 'Pin'}
        </MenuItem>
        {!reading && (
          <MenuItem icon={<HistoryIcon />} onClick={() => close(() => setHistory(true))}>
            History
          </MenuItem>
        )}
        {tasks?.any && editor && !reading && (
          <section className="mt-1 border-t-2 border-border pt-2">
            <p className="px-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Checked tasks</p>
            <div role="group" aria-label="Checked tasks" className="flex py-1 [&>*]:flex-1 [&>*]:justify-center">
              <Button aria-pressed={!hiding} onClick={() => setMode('hideChecked', false)}>
                Show
              </Button>
              <Button aria-pressed={hiding && !deleting} onClick={() => setMode('hideChecked', true)}>
                Hide
              </Button>
              <Button aria-pressed={deleting} onClick={() => setMode('deleteChecked', true)}>
                Delete
              </Button>
            </div>
            {tasks.checked && (
              <>
                <MenuItem icon={<UncheckAllIcon />} onClick={() => close(() => uncheckAll(editor))}>
                  Uncheck all
                </MenuItem>
                <MenuItem
                  icon={<TrashIcon />}
                  onClick={() => close(() => (hiding ? setClearing(true) : deleteChecked(editor)))}
                >
                  Delete checked
                </MenuItem>
              </>
            )}
          </section>
        )}
        <div className="mt-1 border-t-2 border-border pt-1">
          <MenuItem
            icon={mine ? <TrashIcon /> : <LeaveIcon />}
            aria-expanded={nested > 0 ? panel === 'remove' : undefined}
            onClick={() => (nested > 0 ? setPanel(panel === 'remove' ? 'menu' : 'remove') : remove(false))}
          >
            {mine ? 'Delete note' : 'Leave note'}
          </MenuItem>
          {panel === 'remove' && (
            <>
              <MenuItem icon={<RemoveNoteIcon />} className="pl-8" onClick={() => remove(false)}>
                Just this note
              </MenuItem>
              <MenuItem icon={<RemoveWithNotesIcon />} className="pl-8" onClick={() => remove(true)}>
                With its {nested} {nested === 1 ? 'note' : 'notes'}
              </MenuItem>
            </>
          )}
        </div>
      </div>
    </Popover>
  )

  if (history)
    return (
      <History id={id} doc={doc} onClose={() => setHistory(false)}>
        {back}
      </History>
    )

  return (
    <>
      <header className="note-header flex items-center gap-2 border-b-2 border-border bg-accent px-3 py-2 text-on-accent">
        {back}
        {guest || reading ? (
          title
        ) : (
          <input
            ref={titleRef}
            className="min-w-0 flex-1 truncate bg-transparent text-lg font-bold outline-none placeholder:text-ink-muted"
            placeholder="Title"
            value={(meta.get('title') as string | undefined) ?? ''}
            onChange={(e) => meta.set('title', e.target.value)}
            onKeyDown={toBody}
          />
        )}
        {!guest && (
          <>
            <OfflineIcon />
            {mine ? <ShareDialog id={id} /> : owner}
            {menu}
          </>
        )}
      </header>
      <EditorContent
        editor={editor}
        className="relative flex-1 overflow-y-auto bg-surface"
        data-hide-checked={(hiding && !clearing) || undefined}
        data-finding={panel === 'find' || undefined}
      />
      {editor && !reading && (
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
      {!reading && <Toolbar editor={editor} people={people(id)} />}
    </>
  )
}

function FindBox({
  editor,
  field,
  onClose,
}: {
  editor: TipTapEditor
  field: React.RefObject<HTMLInputElement | null>
  onClose: () => void
}) {
  const { query, current, matches } = useEditorState({ editor, selector: ({ editor }) => find.getState(editor.state)! })
  const send = (meta: { query: string } | { step: 1 | -1 }) => editor.view.dispatch(editor.state.tr.setMeta(find, meta))
  // Closing the box, however it closes, clears its marks.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(find, { query: '' }))
    },
    [editor],
  )
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        ref={field}
        aria-label="Find in note"
        autoFocus
        value={query}
        onChange={(e) => send({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          send({ step: e.shiftKey ? -1 : 1 })
        }}
        className="h-9 min-w-0 flex-1 border-2 border-border bg-bg px-2 outline-none focus:border-accent-ink"
      />
      {query && (
        <span className="shrink-0 px-1 text-sm whitespace-nowrap text-ink-muted">
          {matches.length ? `${current + 1} of ${matches.length}` : 'No matches.'}
        </span>
      )}
      {/* The buttons leave the field focused, so the phone's keyboard stays up. */}
      <IconButton label="Previous match" onMouseDown={(e) => e.preventDefault()} onClick={() => send({ step: -1 })}>
        <ChevronUpIcon />
      </IconButton>
      <IconButton label="Next match" onMouseDown={(e) => e.preventDefault()} onClick={() => send({ step: 1 })}>
        <ChevronDownIcon />
      </IconButton>
      <IconButton label="Close" onClick={onClose}>
        <CloseIcon />
      </IconButton>
    </div>
  )
}
