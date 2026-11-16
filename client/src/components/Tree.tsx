import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMatch, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useStore, useY } from '../sync/hooks'
import { search } from '../sync/search'
import { store, textOf, wipeLocal } from '../sync/store'
import {
  children,
  createNote,
  expand,
  inTrash,
  isCollapsed,
  isMine,
  isPinned,
  landing,
  moveNotes,
  nodes,
  ownerName,
  purgeNote,
  removeFromTree,
  restoreNote,
  settings,
  shareCount,
  titleOf,
  toggleCollapsed,
  trashed,
  type Spot,
} from '../sync/tree'
import { Button, IconButton } from './Button'
import { dayOf, dueLabel, overdue } from './dates'
import { CalendarIcon, CheckedIcon, GripIcon, LeaveIcon, PinIcon, PlusIcon, TrashIcon } from './icons'
import { draggedLine } from './lists'
import { OfflineIcon } from './OfflineIcon'
import { SettingsDialog } from './SettingsDialog'
import { noteTheme } from './themes'

const ROOT = 'root'
const INDENT = 16
type Zone = 'before' | 'inside' | 'after'
interface Hint {
  id: string
  zone: Zone
}
// The note a dragged note goes into is outlined, and a line marks its place among the rows in view.
interface Mark {
  into: string | null
  line: { row: string; edge: 'top' | 'bottom'; depth: number } | null
}

// Below an open note with children is where its first child goes, since that is where the line shows. A note that
// moves is no place to drop the notes moving with it.
function spotOf(ids: string[], { id: target, zone }: Hint): Spot | null {
  if (target === ROOT) return landing(ids, null)
  if (ids.includes(target)) return null
  if (zone === 'inside') return landing(ids, target)
  if (zone === 'after' && !isCollapsed(target) && children(target).length > 0) return landing(ids, target, 0)
  const parent = nodes().get(target)?.parent ?? null
  const index = children(parent)
    .filter((s) => !ids.includes(s))
    .indexOf(target)
  return landing(ids, parent, zone === 'before' ? index : index + 1)
}

function markOf(ids: string[], { parent, index }: Spot): Mark {
  const kids = children(parent).filter((s) => !ids.includes(s))
  if (kids.length === 0 || (parent && isCollapsed(parent))) return { into: parent, line: null }
  let depth = 0
  for (let p = parent; p; p = nodes().get(p)?.parent ?? null) depth++
  if (index < kids.length) return { into: parent, line: { row: kids[index], edge: 'top', depth } }
  // At the end, the line goes under the last row of the last child's open subtree.
  let last = kids[kids.length - 1]
  while (!isCollapsed(last) && children(last).length > 0) last = children(last).at(-1)!
  return { into: parent, line: { row: last, edge: 'bottom', depth } }
}

// On a touch screen the dragged title rides a row above the finger, so the row it would land on stays in sight.
const aboveFinger: Modifier = ({ transform, activatorEvent }) =>
  activatorEvent && 'touches' in activatorEvent ? { ...transform, y: transform.y - 48 } : transform

// On a touch screen a row drags by its grip, at once, like a line in a note. A touch anywhere else taps or scrolls.
class HandleSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent }: React.TouchEvent) => (nativeEvent.target as Element).closest('[data-handle]') != null,
    },
  ]
}

// A note opens over the list, never over another note, so back always returns to the list. With a line, it opens
// with the cursor at the end of that line.
function useShowNote() {
  const navigate = useNavigate()
  const open = useMatch('/n/:id') != null
  return (id: string, line?: string) =>
    navigate(`/n/${id}${line == null ? '' : `?line=${encodeURIComponent(line)}`}`, { replace: open })
}

// The token lets the widget read from the server while the app is closed. The tree is the user's own doc, and a
// widget given it shows all their notes.
function handOff(widget: string, id: string) {
  const tree = id === store.me!.id
  void api.widgetToken(id).then(({ token }) => {
    const query = new URLSearchParams({ id: widget, note: tree ? 'tree' : id, title: tree ? 'Notes' : titleOf(id), token })
    window.location.href = `intent://widget?${query}#Intent;scheme=nichenotes;end`
  })
}

// The widget picker is this same tree, where choosing a note hands it to the widget instead of opening it.
function useOpenNote() {
  const showNote = useShowNote()
  const widget = useMatch('/widget/:id')?.params.id
  return (id: string) => (widget ? handOff(widget, id) : showNote(id))
}

export function Tree({ selected }: { selected?: string }) {
  const s = useStore()
  const prefs = settings()
  useY(prefs)
  const navigate = useNavigate()
  const showNote = useShowNote()
  const openNote = useOpenNote()
  const widget = useMatch('/widget/:id')?.params.id
  const picking = widget != null
  // The notes widget has nothing to pick, so it gets the tree once the server can hand out a token.
  const allNotes = picking && new URLSearchParams(location.search).has('tree')
  const roots = children(null)
  const trash = trashed()
  const [trashOpen, setTrashOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The row arrow keys and Enter act on. Opening a result moves it there too, so the arrows go on from the open note.
  const [cursor, setCursor] = useState(0)
  const searchTrash = prefs.get('searchTrash') !== false
  const searchChecked = prefs.get('searchChecked') === true
  const hits = search(query, { trash: searchTrash, checked: searchChecked })
  // Every line due today or earlier, under its note. The note with the oldest line comes first.
  const [dueOpen, setDueOpen] = useState(false)
  const today = dayOf(new Date())
  const due = [...nodes().keys()]
    .filter((id) => !inTrash(id))
    .flatMap((id) => textOf(id).dated.map((line) => ({ id, ...line })))
    .filter((line) => line.due.split('T')[0] <= today)
    .sort((a, b) => a.due.localeCompare(b.due))
  const dueNotes = new Map<string, typeof due>()
  for (const line of due) dueNotes.set(line.id, [...(dueNotes.get(line.id) ?? []), line])
  // Shift picks every row from the last one clicked to this one, and Ctrl or ⌘ picks or drops this one, so several
  // notes can be dragged together. A plain click opens the note and lets the rest go.
  const [picked, setPicked] = useState(new Set<string>())
  const anchor = useRef<string>(undefined)
  const pick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const shown = (parent: string | null): string[] =>
        children(parent).flatMap((kid) => [kid, ...(isCollapsed(kid) ? [] : shown(kid))])
      const rows = shown(null)
      anchor.current ??= selected ?? id
      const to = rows.indexOf(id)
      const from = rows.includes(anchor.current) ? rows.indexOf(anchor.current) : to
      return setPicked(new Set(rows.slice(Math.min(from, to), Math.max(from, to) + 1)))
    }
    anchor.current = id
    if (!e.metaKey && !e.ctrlKey) {
      setPicked(new Set())
      return openNote(id)
    }
    const next = new Set(picked.size > 0 || !selected ? picked : [selected])
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }
  // Dragging a picked note takes the others along, in the tree's order. A note under a picked one moves with it.
  const lifted = (parent: string | null): string[] =>
    children(parent).flatMap((kid) => (picked.has(kid) ? [kid] : lifted(kid)))
  const moving = (id: string) => (picked.has(id) ? lifted(null) : [id])
  const [dragging, setDragging] = useState<string | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const latestHint = useRef<Hint | null>(null)
  const pointer = useRef<{ y: number } | null>(null)
  const spot = dragging && hint ? spotOf(moving(dragging), hint) : null
  const mark = dragging && spot ? markOf(moving(dragging), spot) : null

  useEffect(() => {
    if (widget && allNotes && s.online) handOff(widget, store.me!.id)
  }, [widget, allNotes, s.online])

  // A tree that is behind doesn't know every note under the one that goes.
  useEffect(() => {
    if (!s.treeCurrent) return
    for (const id of s.lost) removeFromTree(id)
    s.lost.clear()
  })

  // The app comes to the front with the choice, so the next launch is the normal tree again.
  useEffect(() => {
    if (!picking) return
    const leave = () => document.hidden && navigate('/', { replace: true })
    document.addEventListener('visibilitychange', leave)
    return () => document.removeEventListener('visibilitychange', leave)
  }, [picking, navigate])

  const sensors = useSensors(
    useSensor(HandleSensor),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  )

  // Top and bottom edges of a row mean "next to it", the middle means "inside it".
  // The pointer is the one dnd-kit picked `over` with, so the two agree while the list scrolls.
  const onDragMove = ({ over }: DragMoveEvent) => {
    let next: Hint | null = null
    if (over?.id === ROOT) next = { id: ROOT, zone: 'inside' }
    else if (over && pointer.current) {
      const rel = (pointer.current.y - over.rect.top) / over.rect.height
      next = { id: String(over.id), zone: rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside' }
    }
    latestHint.current = next
    setHint(next)
  }

  const onDragEnd = ({ active }: DragEndEvent) => {
    const target = latestHint.current
    latestHint.current = null
    setHint(null)
    setDragging(null)
    const ids = moving(String(active.id))
    const to = target && spotOf(ids, target)
    if (!to) return
    moveNotes(ids, to)
    if (to.parent) expand(to.parent)
  }

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setCursor(Math.min(cursor + 1, hits.length - 1))
    else if (e.key === 'ArrowUp') setCursor(Math.max(cursor - 1, 0))
    else if (e.key === 'Enter' && hits[cursor]) openNote(hits[cursor].id)
    else if (e.key === 'Escape') setQuery('')
    else return
    e.preventDefault()
  }

  const signOut = async () => {
    await api.logout()
    await wipeLocal()
    window.location.href = '/auth/login'
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        pointer.current = args.pointerCoordinates
        return pointerWithin(args)
      }}
      onDragStart={({ active }: DragStartEvent) => setDragging(String(active.id))}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setHint(null)
        setDragging(null)
      }}
    >
      {picking && (!allNotes || s.online === false) && (
        <p className="border-b-2 border-border bg-accent px-4 py-3 text-sm font-bold text-on-accent">
          {s.online === false ? 'Connect to the internet to add the widget' : 'Tap a note to show it in the widget'}
        </p>
      )}
      <RootDropZone active={hint?.id === ROOT}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            type="search"
            placeholder="Search notes"
            aria-label="Search notes"
            className="w-full bg-transparent pr-8 text-lg font-bold outline-none placeholder:text-ink-muted"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
              setDueOpen(false)
            }}
            onKeyDown={onSearchKey}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-0 h-8 w-8 text-lg leading-none"
              onClick={() => setQuery('')}
            >
              ✕
            </button>
          )}
        </div>
        {query && (
          <>
            <IconButton
              label="Include trash"
              aria-pressed={searchTrash}
              className={searchTrash ? 'text-accent-ink' : ''}
              onClick={() => prefs.set('searchTrash', !searchTrash)}
            >
              <TrashIcon />
            </IconButton>
            <IconButton
              label="Include checked lines"
              aria-pressed={searchChecked}
              className={searchChecked ? 'text-accent-ink' : ''}
              onClick={() => prefs.set('searchChecked', !searchChecked)}
            >
              <CheckedIcon />
            </IconButton>
          </>
        )}
        {!picking && (due.length > 0 || dueOpen) && (
          <IconButton
            label={`Due (${due.length})`}
            aria-pressed={dueOpen}
            className={`px-1 ${dueOpen ? 'text-accent-ink' : ''}`}
            onClick={() => {
              setQuery('')
              setDueOpen(!dueOpen)
            }}
          >
            <CalendarIcon />
            <span className="font-bold">{due.length}</span>
          </IconButton>
        )}
        <OfflineIcon />
        {!s.me!.guest && (
          <Button
            variant="primary"
            aria-label="New note"
            title="New note"
            className="w-10 px-0!"
            onClick={() => showNote(createNote(null))}
          >
            <PlusIcon />
          </Button>
        )}
      </RootDropZone>
      <nav className="flex-1 overflow-x-hidden overflow-y-auto">
        {query ? (
          hits.length === 0 ? (
            <p className="p-6 text-ink-muted">No matches.</p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {hits.map((hit, i) => {
                // The open note is filled like its row in the tree, and the arrow keys' row is outlined.
                const active = selected === hit.id
                const muted = active ? 'text-on-accent/80' : 'text-ink-muted'
                return (
                  <li key={hit.id} role="option" aria-selected={i === cursor}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full flex-col px-4 py-2 text-left ${active ? 'bg-accent text-on-accent' : i === cursor ? 'bg-bg' : 'hover:bg-bg'} ${i === cursor ? 'outline-2 -outline-offset-2 outline-accent-ink' : ''}`}
                      onClick={() => {
                        setCursor(i)
                        openNote(hit.id)
                      }}
                    >
                      <span className="flex w-full items-baseline gap-2">
                        <span className="truncate font-medium">{titleOf(hit.id)}</span>
                        {!isMine(hit.id) && <span className={`shrink-0 text-xs ${muted}`}>{ownerName(hit.id)}</span>}
                        {inTrash(hit.id) && <span className={`shrink-0 text-xs ${muted}`}>trash</span>}
                      </span>
                      {hit.snippet && <span className={`w-full truncate text-xs ${muted}`}>{hit.snippet}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : dueOpen ? (
          due.length === 0 ? (
            <p className="p-6 text-ink-muted">Nothing due.</p>
          ) : (
            <ul aria-label="Due">
              {[...dueNotes].map(([id, lines]) => (
                <li key={id}>
                  <p className="truncate px-4 pt-3 text-xs font-bold uppercase tracking-wide text-ink-muted">{titleOf(id)}</p>
                  {lines.map((line, i) => (
                    <button
                      key={i}
                      type="button"
                      className="flex w-full items-baseline gap-2 px-4 py-2 text-left hover:bg-bg"
                      onClick={() => showNote(id, line.text)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{line.text}</span>
                      <span className={`shrink-0 text-xs font-bold ${overdue(line.due) ? 'text-accent-ink' : 'text-ink-muted'}`}>
                        {dueLabel(line.due)}
                      </span>
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {roots.length === 0 && <p className="p-6 text-ink-muted">No notes yet.{!s.me!.guest && ' Tap New.'}</p>}
            {roots.map((id) => (
              <Row key={id} id={id} depth={0} selected={selected} picked={picked} onPick={pick} mark={mark} />
            ))}
          </>
        )}
      </nav>
      {trashOpen && trash.length > 0 && (
        <section className="max-h-64 shrink-0 overflow-y-auto border-t-2 border-border">
          <p className="px-4 pt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Trash</p>
          {trash.map((id) => (
            <TrashRow key={id} id={id} selected={selected} />
          ))}
        </section>
      )}
      <footer className="flex items-center gap-1 border-t-2 border-border py-1 pl-4 pr-2 text-sm">
        <span className="flex-1 truncate">{s.me!.name}</span>
        {trash.length > 0 && (
          <IconButton
            label={`Trash (${trash.length})`}
            aria-expanded={trashOpen}
            className={`px-1 ${trashOpen ? 'text-accent-ink' : ''}`}
            onClick={() => setTrashOpen(!trashOpen)}
          >
            <TrashIcon />
            <span className="font-bold">{trash.length}</span>
          </IconButton>
        )}
        <SettingsDialog />
        <IconButton label="Sign out" onClick={signOut}>
          <LeaveIcon />
        </IconButton>
      </footer>
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[aboveFinger]}>
          {dragging && (
            <div className="truncate border-2 border-border bg-surface px-3 py-2 font-medium shadow-brutal">
              {moving(dragging).length > 1 ? `${moving(dragging).length} notes` : titleOf(dragging)}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

// A trashed note reads like a row, its title in line with theirs, with Restore and the final action where the + would be.
function TrashRow({ id, selected }: { id: string; selected?: string }) {
  const navigate = useNavigate()
  const showNote = useShowNote()
  const s = useStore()
  const active = selected === id
  return (
    <div
      className={`flex items-center gap-3 pr-3 pl-8 text-sm pointer-coarse:pl-15 ${active ? 'bg-accent text-on-accent' : 'hover:bg-bg'}`}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-3 text-left"
        onClick={() => showNote(id)}
      >
        <span className="truncate font-medium">{titleOf(id)}</span>
        {!isMine(id) && (
          <span className={`shrink-0 text-xs ${active ? 'text-on-accent/80' : 'text-ink-muted'}`}>{ownerName(id)}</span>
        )}
      </button>
      <button type="button" className="shrink-0 underline" onClick={() => restoreNote(id)}>
        Restore
      </button>
      <button
        type="button"
        className="shrink-0 underline disabled:opacity-40"
        disabled={!s.online}
        onClick={() => {
          void purgeNote(id)
          if (active) navigate(-1)
        }}
      >
        {isMine(id) ? 'Delete forever' : 'Leave for good'}
      </button>
    </div>
  )
}

// Dropping on the header puts a note at the top level.
function RootDropZone({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: ROOT })
  return (
    <header
      ref={setNodeRef}
      className={`flex items-center gap-2 border-b-2 border-border px-4 py-3 ${active ? 'bg-accent text-on-accent' : ''}`}
    >
      {children}
    </header>
  )
}

function Row({
  id,
  depth,
  selected,
  picked,
  onPick,
  mark,
}: {
  id: string
  depth: number
  selected?: string
  picked: Set<string>
  onPick: (id: string, e: React.MouseEvent) => void
  mark: Mark | null
}) {
  const showNote = useShowNote()
  const { setNodeRef: dragRef, listeners, attributes, isDragging } = useDraggable({ id })
  const { setNodeRef: dropRef } = useDroppable({ id, disabled: isDragging })
  // A line dragged out of the open note moves into the note it is dropped on.
  const [taking, setTaking] = useState(false)
  if (inTrash(id)) return null

  const kids = children(id)
  const open = !isCollapsed(id)
  // While notes are picked, the fill marks them instead of the open note.
  const active = picked.size > 0 ? picked.has(id) : selected === id
  const color = noteTheme(id)?.color
  const tag = !isMine(id) ? ownerName(id) : shareCount(id) > 0 ? 'shared' : null
  const line = mark?.line?.row === id ? mark.line : null
  const into = mark?.into === id

  return (
    <>
      <div
        ref={dropRef}
        className={`relative flex select-none items-center pr-1 ${active ? 'bg-accent text-on-accent' : 'hover:bg-bg'} ${isDragging ? 'opacity-40' : ''} ${taking || into ? `outline-2 -outline-offset-2 ${active ? 'outline-ink' : 'outline-accent-ink'}` : ''}`}
        style={{ paddingLeft: 4 + depth * INDENT }}
        data-drop-into={into || undefined}
        onDragOver={(e) => {
          if (!draggedLine()) return
          e.preventDefault()
          setTaking(true)
        }}
        onDragLeave={() => setTaking(false)}
        onDrop={(e) => {
          e.preventDefault()
          setTaking(false)
          draggedLine()?.(id)
        }}
      >
        {line && (
          <span
            data-drop-line
            className={`pointer-events-none absolute right-0 h-[3px] before:absolute before:-top-1 before:left-0 before:h-[11px] before:w-[11px] before:content-[''] ${line.edge === 'top' ? 'top-0' : 'bottom-0'} ${active ? 'bg-ink before:bg-ink' : 'bg-accent-ink before:bg-accent-ink'}`}
            style={{ left: 4 + line.depth * INDENT }}
          />
        )}
        {/* The note's color sits beside its grip and moves in with its nesting. */}
        {color && (
          <span
            className="pointer-events-none absolute inset-y-0 w-1.5"
            style={{ left: 4 + depth * INDENT, background: color }}
          />
        )}
        <span
          {...listeners}
          data-handle
          aria-hidden
          className={`hidden h-11 w-7 shrink-0 touch-none items-center justify-center pointer-coarse:flex ${active ? 'text-on-accent/80' : 'text-ink-muted'}`}
        >
          <GripIcon className="h-5 w-5" />
        </span>
        {kids.length > 0 ? (
          <button
            type="button"
            className="h-11 w-7 shrink-0 text-xs"
            onClick={() => toggleCollapsed(id)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <button
          ref={dragRef}
          {...listeners}
          {...attributes}
          type="button"
          aria-current={selected === id ? 'page' : undefined}
          aria-pressed={picked.has(id) || undefined}
          className="flex min-w-0 flex-1 touch-manipulation items-baseline gap-2 py-3 text-left"
          onClick={(e) => onPick(id, e)}
        >
          <span className="truncate font-medium">{titleOf(id)}</span>
          {isPinned(id) && (
            <PinIcon filled className={`h-3.5 w-3.5 shrink-0 self-center ${active ? '' : 'text-accent-ink'}`} />
          )}
          {tag && <span className={`shrink-0 text-xs ${active ? 'text-on-accent/80' : 'text-ink-muted'}`}>{tag}</span>}
        </button>
        {!store.me!.guest && (
          <button
            type="button"
            className="h-11 w-10 shrink-0 text-xl leading-none"
            aria-label="New note inside"
            title="New note inside"
            onClick={() => {
              expand(id)
              showNote(createNote(id))
            }}
          >
            +
          </button>
        )}
      </div>
      {open &&
        kids.map((kid) => (
          <Row key={kid} id={kid} depth={depth + 1} selected={selected} picked={picked} onPick={onPick} mark={mark} />
        ))}
    </>
  )
}
