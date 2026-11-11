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
} from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMatch, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useStore, useY } from '../sync/hooks'
import { search } from '../sync/search'
import { expand, toggleCollapsed, wipeLocal } from '../sync/store'
import {
  children,
  createNote,
  inTrash,
  isMine,
  isPinned,
  nodes,
  ownerName,
  placeNote,
  placeSibling,
  purgeNote,
  removeFromTree,
  restoreNote,
  shareCount,
  titleOf,
  trashed,
} from '../sync/tree'
import { Button } from './Button'
import { PinIcon } from './icons'
import { OfflineIcon } from './OfflineIcon'
import { SettingsDialog } from './SettingsDialog'

const ROOT = 'root'
const INDENT = 16
type Zone = 'before' | 'inside' | 'after'
interface Hint {
  id: string
  zone: Zone
}

// The grip shown on touch screens drags at once. Anywhere else on a row needs the long press.
class HandleSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent }: React.TouchEvent) => (nativeEvent.target as Element).closest('[data-handle]') != null,
    },
  ]
}

// The widget picker is this same tree, where choosing a note hands it to the widget instead of opening it.
function useOpenNote() {
  const navigate = useNavigate()
  const widget = useMatch('/widget/:id')?.params.id
  return (id: string) => {
    if (!widget) return navigate(`/n/${id}`)
    const query = new URLSearchParams({ id: widget, note: id, title: titleOf(id) })
    window.location.href = `intent://widget?${query}#Intent;scheme=nichenotes;package=app.nichenotes;end`
  }
}

export function Tree({ selected }: { selected?: string }) {
  const s = useStore()
  const navigate = useNavigate()
  const openNote = useOpenNote()
  const picking = useMatch('/widget/:id') != null
  useY(nodes())
  const roots = children(null)
  const trash = trashed()
  const [trashOpen, setTrashOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const hits = search(query)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const latestHint = useRef<Hint | null>(null)

  useEffect(() => {
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
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )

  // Top and bottom edges of a row mean "next to it", the middle means "inside it".
  const onDragMove = ({ over, activatorEvent, delta }: DragMoveEvent) => {
    let next: Hint | null = null
    if (over?.id === ROOT) next = { id: ROOT, zone: 'inside' }
    else if (over) {
      const startY =
        'clientY' in activatorEvent
          ? (activatorEvent as MouseEvent).clientY
          : ((activatorEvent as TouchEvent).touches?.[0]?.clientY ?? 0)
      const rel = (startY + delta.y - over.rect.top) / over.rect.height
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
    if (!target) return
    const id = String(active.id)
    if (target.id === ROOT) placeNote(id, null)
    else if (target.zone === 'inside') {
      placeNote(id, target.id)
      expand(target.id)
    } else placeSibling(id, target.id, target.zone)
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
      collisionDetection={pointerWithin}
      onDragStart={({ active }: DragStartEvent) => setDragging(String(active.id))}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setHint(null)
        setDragging(null)
      }}
    >
      {picking && (
        <p className="border-b-2 border-border bg-accent px-4 py-2 text-sm font-bold text-white">
          Tap a note to show it in the widget
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
        <OfflineIcon />
        <Button variant="primary" onClick={() => navigate(`/n/${createNote(null)}`)}>
          + New
        </Button>
      </RootDropZone>
      <nav className="flex-1 overflow-x-hidden overflow-y-auto">
        {query ? (
          hits.length === 0 ? (
            <p className="p-6 text-ink-muted">No matches.</p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {hits.map((hit, i) => (
                <li key={hit.id} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    className={`flex w-full flex-col px-4 py-2 text-left ${i === cursor ? 'bg-bg outline-2 -outline-offset-2 outline-accent' : 'hover:bg-bg'}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => openNote(hit.id)}
                  >
                    <span className="flex w-full items-baseline gap-2">
                      <span className="truncate font-medium">{titleOf(hit.id)}</span>
                      {!isMine(hit.id) && <span className="shrink-0 text-xs text-ink-muted">{ownerName(hit.id)}</span>}
                      {inTrash(hit.id) && <span className="shrink-0 text-xs text-ink-muted">trash</span>}
                    </span>
                    {hit.snippet && <span className="w-full truncate text-xs text-ink-muted">{hit.snippet}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {roots.length === 0 && <p className="p-6 text-ink-muted">No notes yet. Tap New.</p>}
            {roots.map((id) => (
              <Row key={id} id={id} depth={0} selected={selected} hint={hint} />
            ))}
          </>
        )}
      </nav>
      {trash.length > 0 && (
        <section className="shrink-0 border-t-2 border-border">
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-muted"
            onClick={() => setTrashOpen(!trashOpen)}
          >
            Trash ({trash.length})
          </button>
          {trashOpen && (
            <div className="max-h-56 overflow-y-auto">
              {trash.map((id) => (
                <TrashRow key={id} id={id} selected={selected} />
              ))}
            </div>
          )}
        </section>
      )}
      <footer className="flex items-center gap-3 border-t-2 border-border px-4 py-2 text-sm">
        <span className="flex-1 truncate">{s.me!.name}</span>
        <SettingsDialog />
        <button type="button" className="underline" onClick={signOut}>
          Sign out
        </button>
      </footer>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="truncate border-2 border-border bg-surface px-3 py-2 font-medium shadow-brutal">
              {titleOf(dragging)}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

// A trashed note reads like a row, with Restore and the final action where the + would be.
function TrashRow({ id, selected }: { id: string; selected?: string }) {
  const navigate = useNavigate()
  const s = useStore()
  const active = selected === id
  return (
    <div
      className={`flex items-center gap-3 pr-3 text-sm ${active ? 'bg-accent text-white' : 'hover:bg-bg'}`}
      style={{ paddingLeft: 4 + 28 }}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-3 text-left"
        onClick={() => navigate(`/n/${id}`)}
      >
        <span className="truncate font-medium">{titleOf(id)}</span>
        {!isMine(id) && (
          <span className={`shrink-0 text-xs ${active ? 'text-white/80' : 'text-ink-muted'}`}>{ownerName(id)}</span>
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
          if (active) navigate('/')
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
      className={`flex items-center gap-2 border-b-2 border-border px-4 py-3 ${active ? 'bg-accent text-white' : ''}`}
    >
      {children}
    </header>
  )
}

function Row({ id, depth, selected, hint }: { id: string; depth: number; selected?: string; hint: Hint | null }) {
  const navigate = useNavigate()
  const openNote = useOpenNote()
  const s = useStore()
  const { setNodeRef: dragRef, listeners, attributes, isDragging } = useDraggable({ id })
  const { setNodeRef: dropRef } = useDroppable({ id, disabled: isDragging })
  if (inTrash(id)) return null

  const kids = children(id)
  const open = !s.collapsed.has(id)
  const active = selected === id
  const tag = !isMine(id) ? ownerName(id) : shareCount(id) > 0 ? 'shared' : null
  const zone = hint?.id === id ? hint.zone : null

  return (
    <>
      <div
        ref={dropRef}
        className={`relative flex items-center pr-1 ${active ? 'bg-accent text-white' : 'hover:bg-bg'} ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: 4 + depth * INDENT }}
      >
        {/* The drop line sits where the note will land, indented the way the note will be. */}
        {zone && (
          <span
            className={`pointer-events-none absolute right-0 h-[3px] before:absolute before:-top-1 before:left-0 before:h-[11px] before:w-[11px] before:content-[''] ${zone === 'before' ? 'top-0' : 'bottom-0'} ${active ? 'bg-ink before:bg-ink' : 'bg-accent before:bg-accent'}`}
            style={{ left: 4 + (zone === 'inside' ? depth + 1 : depth) * INDENT }}
          />
        )}
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
          aria-current={active ? 'page' : undefined}
          className="flex min-w-0 flex-1 touch-manipulation items-baseline gap-2 py-3 text-left"
          onClick={() => openNote(id)}
        >
          <span className="truncate font-medium">{titleOf(id)}</span>
          {isPinned(id) && <PinIcon filled className="h-3.5 w-3.5 shrink-0 self-center" />}
          {tag && <span className={`shrink-0 text-xs ${active ? 'text-white/80' : 'text-ink-muted'}`}>{tag}</span>}
        </button>
        <button
          type="button"
          className="h-11 w-10 shrink-0 text-xl leading-none"
          aria-label="New note inside"
          title="New note inside"
          onClick={() => {
            expand(id)
            navigate(`/n/${createNote(id)}`)
          }}
        >
          +
        </button>
        <span
          {...listeners}
          data-handle
          aria-hidden
          className={`hidden h-11 w-8 shrink-0 touch-none items-center justify-center text-lg pointer-coarse:flex ${active ? 'text-white/80' : 'text-ink-muted'}`}
        >
          ⋮⋮
        </span>
      </div>
      {open && kids.map((kid) => <Row key={kid} id={kid} depth={depth + 1} selected={selected} hint={hint} />)}
    </>
  )
}
