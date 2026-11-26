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
import { MOD } from '../lib/keys'
import { useStore, useY } from '../sync/hooks'
import { search } from '../sync/search'
import { moveDue, store, textOf, tickDue } from '../sync/store'
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
  people,
  purgeNote,
  readOnly,
  removeFromTree,
  restoreNote,
  settings,
  shareCount,
  titleOf,
  toggleCollapsed,
  trashed,
  type Spot,
} from '../sync/tree'
import { Button, IconButton, KeyChip, MenuItem } from './Button'
import { dayOf, dueLabel, inDays, overdue } from './dates'
import {
  CalendarIcon,
  CheckedIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  FilterIcon,
  GripIcon,
  PinIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from './icons'
import { OfflineIcon } from './OfflineIcon'
import { Popover } from './Popover'
import { SettingsDialog } from './SettingsDialog'
import { noteTheme } from './themes'

const ROOT = 'root'
const INDENT = 16
const DUE_SECTIONS = ['Past due', 'Today', 'Tomorrow', 'Later']
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

export function Tree({ open }: { open?: string }) {
  const s = useStore()
  const prefs = settings()
  useY(prefs)
  const navigate = useNavigate()
  const showNote = useShowNote()
  const openOrHandOff = useOpenNote()
  const widget = useMatch('/widget/:id')?.params.id
  // Export picks a note in this same tree, from Settings, and a tap downloads it.
  const [exporting, setExporting] = useState(false)
  const openNote = (id: string) => {
    if (!exporting) return openOrHandOff(id)
    setExporting(false)
    void import('./markdown').then(({ exportNote }) => exportNote(id))
  }
  const picking = widget != null
  // The notes widget has nothing to pick, so it gets the tree once the server can hand out a token.
  const allNotes = picking && new URLSearchParams(location.search).has('tree')
  const roots = children(null)
  const trash = trashed()
  const [trashOpen, setTrashOpen] = useState(false)
  // The notes last opened on this device, without the open one. Whether the list shows stays with the device too.
  const opened = JSON.parse(localStorage.getItem('recent') ?? '[]') as string[]
  const recent = opened.filter((id) => id !== open && nodes().has(id) && !inTrash(id))
  // A phone shows the tree with no note open, so the last note opened stands in as the selected one, to find it again.
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 767px)')
    const change = () => setNarrow(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const selected = open ?? (narrow && nodes().has(opened[0]) && !inTrash(opened[0]) ? opened[0] : undefined)
  const [recentOpen, setRecentOpen] = useState(localStorage.getItem('recentOpen') === 'true')
  const [query, setQuery] = useState('')
  // The row arrow keys and Enter act on. Opening a result moves it there too, so the arrows go on from the open note.
  const [cursor, setCursor] = useState(0)
  const searchTrash = prefs.get('searchTrash') !== false
  const searchChecked = prefs.get('searchChecked') === true
  const hits = search(query, { trash: searchTrash, checked: searchChecked })
  const matched = new Map(hits.map((hit) => [hit.id, hit.snippet]))
  // A result unfolds on its own, apart from the tree and from the same note listed elsewhere in the results.
  const [unfolded, setUnfolded] = useState(new Set<string>())
  if (!query && unfolded.size > 0) setUnfolded(new Set())
  const listed = (ids: string[], depth: number, path: string): { id: string; depth: number; path: string }[] =>
    ids.flatMap((id) => [
      { id, depth, path: path + id },
      ...(unfolded.has(path + id) ? listed(children(id), depth + 1, `${path}${id}/`) : []),
    ])
  const results = listed(hits.map((hit) => hit.id), 0, '')
  // Every dated line that isn't assigned to someone else on its note, in a section for when it is due, under its
  // note. The note with the oldest line comes first. The count is what needs doing by today.
  const [dueOpen, setDueOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const today = dayOf(new Date())
  const tomorrow = inDays(1)
  const dated = [...nodes().keys()]
    .filter((id) => !inTrash(id))
    .flatMap((id) => {
      const on = people(id).map((u) => u.id)
      return textOf(id)
        .dated.filter((line) => !line.assignee || line.assignee === s.me!.id || !on.includes(line.assignee))
        .map((line) => ({ id, ...line }))
    })
    .sort((a, b) => a.due.localeCompare(b.due))
  const dueCount = dated.filter((line) => line.due.split('T')[0] <= today).length
  const sections = new Map<string, Map<string, typeof dated>>(DUE_SECTIONS.map((name) => [name, new Map()]))
  for (const line of dated) {
    const day = line.due.split('T')[0]
    const notes = sections.get(day < today ? 'Past due' : day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : 'Later')!
    notes.set(line.id, [...(notes.get(line.id) ?? []), line])
  }
  const dueCollapsed = (prefs.get('dueCollapsed') as string[] | undefined) ?? []
  // Ticked lines stay until the ticking stops for two seconds, as in the Due widget, so a wrong tap can be taken back.
  const [ticked, setTicked] = useState(new Map<string, string>())
  const ticking = useRef<number>(undefined)
  const tick = (id: string, item: string) => {
    const next = new Map(ticked)
    if (!next.delete(item)) next.set(item, id)
    setTicked(next)
    clearTimeout(ticking.current)
    ticking.current = window.setTimeout(
      () => void Promise.all([...next].map(([item, id]) => tickDue(id, [item]))).then(() => setTicked(new Map())),
      2000,
    )
  }
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

  // However a note was opened, its row shows in the tree, unfolded as if by hand.
  useEffect(() => {
    if (!selected || inTrash(selected)) return
    for (let p = nodes().get(selected)?.parent; p; p = nodes().get(p)?.parent) expand(p)
  }, [selected])

  // Back from a note, or clearing the search, finds the selected row, and nothing else scrolls the tree.
  useEffect(() => {
    if (!open && !query) document.querySelector('aside [aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, query])

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
    // A finger lifts a row once it holds still on it. Dragging is rare, so a slow tap or scroll never should.
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 10 } }),
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

  const newNote = () => showNote(createNote(null))
  // Ctrl or ⌘ and K search, first leaving the open note as Back does where a narrow window hides the list under it.
  // A browser tab keeps Ctrl+N for itself, and that's accepted.
  const ctrlN = 'nicheNotesApp' in window || matchMedia('(display-mode: standalone)').matches
  const searchField = useRef<HTMLInputElement>(null)
  const searching = useRef(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (k !== 'k' && k !== 'n')) return
      if (picking || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      if (k === 'n') return newNote()
      if (!searchField.current!.offsetParent) {
        searching.current = true
        return navigate(-1)
      }
      searchField.current!.focus()
      searchField.current!.select()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  useEffect(() => {
    if (!searching.current || !searchField.current!.offsetParent) return
    searching.current = false
    searchField.current!.focus()
    searchField.current!.select()
  })

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setCursor(Math.min(cursor + 1, results.length - 1))
    else if (e.key === 'ArrowUp') setCursor(Math.max(cursor - 1, 0))
    else if (e.key === 'Enter' && results[cursor]) openNote(results[cursor].id)
    else if (e.key === 'Escape') setQuery('')
    else return
    e.preventDefault()
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
      {exporting && (
        <div className="flex items-center border-b-2 border-border bg-accent py-1 pl-4 pr-2 text-sm font-bold text-on-accent">
          <p className="flex-1">Tap a note to export it</p>
          <IconButton label="Cancel export" onClick={() => setExporting(false)}>
            <CloseIcon />
          </IconButton>
        </div>
      )}
      <RootDropZone active={hint?.id === ROOT}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <KeyChip keys={`${MOD}K`} className="key-start" />
          <input
            type="search"
            placeholder="Search notes"
            aria-label="Search notes"
            title={`Search notes (${MOD}K)`}
            ref={searchField}
            className="w-full bg-transparent pr-9 text-lg font-bold outline-none placeholder:text-ink-muted"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
              setDueOpen(false)
            }}
            onKeyDown={onSearchKey}
          />
          {query && (
            <IconButton label="Clear search" className="absolute -right-2" onClick={() => setQuery('')}>
              <CloseIcon />
            </IconButton>
          )}
        </div>
        {query && (
          <Popover
            side="bottom"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            trigger={
              <IconButton label="Search filters" className={filtersOpen ? 'text-accent-ink' : ''}>
                <FilterIcon />
              </IconButton>
            }
          >
            <div className="flex w-64 flex-col">
              <MenuItem icon={<TrashIcon />} aria-pressed={searchTrash} onClick={() => prefs.set('searchTrash', !searchTrash)}>
                Include trash
              </MenuItem>
              <MenuItem
                icon={<CheckedIcon />}
                aria-pressed={searchChecked}
                onClick={() => prefs.set('searchChecked', !searchChecked)}
              >
                Include checked tasks
              </MenuItem>
            </div>
          </Popover>
        )}
        {!picking && !exporting && (dated.length > 0 || dueOpen) && (
          <IconButton
            label={`Due (${dueCount})`}
            aria-pressed={dueOpen}
            className={`px-1 ${dueOpen ? 'text-accent-ink' : ''}`}
            onClick={() => {
              setQuery('')
              setDueOpen(!dueOpen)
            }}
          >
            <CalendarIcon />
            {dueCount > 0 && <span className="font-bold">{dueCount}</span>}
          </IconButton>
        )}
        <OfflineIcon />
        <IconButton label="New note" keys={ctrlN ? `${MOD}N` : undefined} title={`New note (${MOD}N)`} onClick={newNote}>
          <PlusIcon />
        </IconButton>
      </RootDropZone>
      <nav className="flex-1 overflow-x-hidden overflow-y-auto">
        {query ? (
          hits.length === 0 ? (
            <p className="p-6 text-ink-muted">No matches.</p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {results.map((result, i) => {
                // The open note is filled like its row in the tree, and the arrow keys' row is outlined.
                const active = selected === result.id
                const muted = active ? 'text-on-accent/80' : 'text-ink-muted'
                const open = unfolded.has(result.path)
                const snippet = matched.get(result.id)
                return (
                  <li
                    key={result.path}
                    role="option"
                    aria-selected={i === cursor}
                    className={`relative flex items-start pr-4 ${active ? 'bg-accent text-on-accent' : i === cursor ? 'bg-bg' : 'hover:bg-bg'} ${i === cursor ? 'outline-2 -outline-offset-2 outline-accent-ink' : ''}`}
                    style={{ paddingLeft: 4 + result.depth * INDENT }}
                  >
                    {children(result.id).length > 0 ? (
                      <button
                        type="button"
                        className="flex h-11 w-7 shrink-0 items-center justify-center"
                        onClick={() => {
                          const next = new Set(unfolded)
                          if (!next.delete(result.path)) next.add(result.path)
                          setUnfolded(next)
                        }}
                        aria-label={open ? 'Collapse' : 'Expand'}
                      >
                        {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      className="flex min-w-0 flex-1 flex-col py-2 text-left"
                      onClick={() => {
                        setCursor(i)
                        openNote(result.id)
                      }}
                    >
                      <span className="flex w-full items-baseline gap-2">
                        <NoteTitle id={result.id} depth={result.depth} active={active} />
                        {inTrash(result.id) && <span className={`shrink-0 text-xs ${muted}`}>trash</span>}
                      </span>
                      {snippet && <span className={`w-full truncate text-xs ${muted}`}>{snippet}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : dueOpen ? (
          dated.length === 0 ? (
            <p className="p-6 text-ink-muted">Nothing due.</p>
          ) : (
            [...sections].map(
              ([name, notes]) =>
                notes.size > 0 && (
                  <section key={name} className="border-t-2 border-border first:border-t-0">
                    <div className="flex items-center pr-4">
                      <button
                        type="button"
                        aria-expanded={!dueCollapsed.includes(name)}
                        className="flex flex-1 items-center gap-2 px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-ink-muted"
                        onClick={() =>
                          prefs.set(
                            'dueCollapsed',
                            dueCollapsed.includes(name) ? dueCollapsed.filter((n) => n !== name) : [...dueCollapsed, name],
                          )
                        }
                      >
                        {dueCollapsed.includes(name) ? <ChevronRightIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                        {name}
                        <span>{[...notes.values()].flat().length}</span>
                      </button>
                      {name === 'Past due' && [...notes.keys()].some((id) => !readOnly(id)) && (
                        <Button
                          className="text-sm"
                          onClick={() => {
                            for (const [id, lines] of notes) {
                              if (!readOnly(id)) void moveDue(id, lines.map((line) => line.item), today)
                            }
                          }}
                        >
                          Move all to today
                        </Button>
                      )}
                    </div>
                    {!dueCollapsed.includes(name) && (
                      <ul aria-label={name} className="pb-2">
                        {[...notes].map(([id, lines]) => (
                          <li key={id}>
                            <button
                              type="button"
                              className="relative flex w-full items-baseline gap-2 px-4 py-3 text-left hover:bg-bg"
                              onClick={() => showNote(id)}
                            >
                              <NoteTitle id={id} />
                            </button>
                            {lines.map((line) => (
                              <div key={line.item} className="flex flex-wrap items-center justify-end gap-x-3 pr-4 hover:bg-bg">
                                <div className="flex min-w-0 flex-auto items-center">
                                  <label className="flex self-stretch items-center pl-8 pr-3">
                                    <input
                                      type="checkbox"
                                      aria-label={line.text}
                                      disabled={readOnly(id)}
                                      checked={ticked.has(line.item)}
                                      onChange={() => tick(id, line.item)}
                                      className="size-[1.15rem] accent-accent"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="flex min-w-0 flex-1 items-baseline gap-2 py-2 text-left"
                                    onClick={() => showNote(id, line.text)}
                                  >
                                    <span className="min-w-0 flex-1 truncate">{line.text}</span>
                                    <span
                                      className={`shrink-0 text-xs font-bold ${overdue(line.due) ? 'text-accent-ink' : 'text-ink-muted'}`}
                                    >
                                      {dueLabel(line.due)}
                                    </span>
                                  </button>
                                </div>
                                {name === 'Past due' && !readOnly(id) && (
                                  <div className="flex gap-3">
                                    <Button className="text-sm" onClick={() => void moveDue(id, [line.item], today)}>
                                      Today
                                    </Button>
                                    <Button className="text-sm" onClick={() => void moveDue(id, [line.item], tomorrow)}>
                                      Tomorrow
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ),
            )
          )
        ) : (
          <>
            {roots.length === 0 && <p className="p-6 text-ink-muted">No notes yet.</p>}
            {roots.map((id) => (
              <Row key={id} id={id} depth={0} selected={selected} picked={picked} onPick={pick} mark={mark} />
            ))}
          </>
        )}
      </nav>
      {recentOpen && recent.length > 0 && (
        <section className="max-h-64 shrink-0 overflow-y-auto border-t-2 border-border">
          <p className="px-4 pt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Recent</p>
          <ul aria-label="Recent">
            {recent.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="relative flex w-full min-w-0 items-baseline gap-2 px-4 py-3 text-left hover:bg-bg"
                  onClick={() => openNote(id)}
                >
                  <NoteTitle id={id} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trashOpen && trash.length > 0 && (
        <section className="max-h-64 shrink-0 overflow-y-auto border-t-2 border-border">
          <p className="px-4 pt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Trash</p>
          {trash.map((id) => (
            <TrashRow key={id} id={id} selected={selected} />
          ))}
        </section>
      )}
      <footer className="flex items-center gap-1 border-t-2 border-border py-1.5 pl-4 pr-2 text-sm">
        <span className="flex-1 truncate">{s.me!.name}</span>
        {recent.length > 0 && (
          <IconButton
            label="Recent"
            aria-expanded={recentOpen}
            className={recentOpen ? 'text-accent-ink' : ''}
            onClick={() => {
              localStorage.setItem('recentOpen', String(!recentOpen))
              setRecentOpen(!recentOpen)
            }}
          >
            <ClockIcon />
          </IconButton>
        )}
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
        <SettingsDialog
          onExportNote={() => {
            setDueOpen(false)
            setExporting(true)
          }}
        />
      </footer>
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[aboveFinger]}>
          {dragging && (
            <div className="truncate border-2 border-border bg-surface px-3 py-2 font-medium">
              {moving(dragging).length > 1 ? `${moving(dragging).length} notes` : titleOf(dragging)}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

// A trashed note reads like any listed note, with Restore and the final action at its end.
function TrashRow({ id, selected }: { id: string; selected?: string }) {
  const navigate = useNavigate()
  const showNote = useShowNote()
  const s = useStore()
  const active = selected === id
  return (
    <div
      className={`relative flex items-center gap-3 px-4 ${active ? 'bg-accent text-on-accent' : 'hover:bg-bg'}`}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-baseline gap-2 py-3 text-left"
        onClick={() => showNote(id)}
      >
        <NoteTitle id={id} active={active} />
      </button>
      <Button className="text-sm" onClick={() => restoreNote(id)}>
        Restore
      </Button>
      <Button
        className="text-sm"
        disabled={!s.online}
        onClick={() => {
          void purgeNote(id)
          if (active) navigate(-1)
        }}
      >
        {isMine(id) ? 'Delete forever' : 'Leave for good'}
      </Button>
    </div>
  )
}

// A note looks the same wherever it is listed: its color beside it, moving in with its nesting, then its title, pin,
// share and owner. The row it sits in is positioned, for the color.
function NoteTitle({ id, depth = 0, active = false }: { id: string; depth?: number; active?: boolean }) {
  const color = noteTheme(id)?.color
  return (
    <>
      {color && (
        <span className="pointer-events-none absolute inset-y-0 w-1.5" style={{ left: 4 + depth * INDENT, background: color }} />
      )}
      <span className="truncate font-medium">{titleOf(id)}</span>
      {isPinned(id) && <PinIcon filled className={`h-3.5 w-3.5 shrink-0 self-center ${active ? '' : 'text-accent-ink'}`} />}
      {(!isMine(id) || shareCount(id) > 0) && (
        <span role="img" aria-label="Shared" title="Shared" className={`shrink-0 self-center ${active ? '' : 'text-accent-ink'}`}>
          <UsersIcon filled className="h-3.5 w-3.5" />
        </span>
      )}
      {!isMine(id) && (
        <span className={`shrink-0 text-xs ${active ? 'text-on-accent/80' : 'text-ink-muted'}`}>{ownerName(id)}</span>
      )}
    </>
  )
}

// Dropping on the header puts a note at the top level.
function RootDropZone({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: ROOT })
  return (
    <header
      ref={setNodeRef}
      className={`flex items-center gap-2 border-b-2 border-border px-4 py-2 ${active ? 'bg-accent text-on-accent' : ''}`}
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
  const { setNodeRef: dragRef, listeners, attributes, isDragging, node } = useDraggable({ id })
  const { setNodeRef: dropRef } = useDroppable({ id, disabled: isDragging })
  useEffect(() => {
    if (selected === id) node.current?.scrollIntoView({ block: 'nearest' })
  }, [selected, id, node])
  if (inTrash(id)) return null

  const kids = children(id)
  const open = !isCollapsed(id)
  // While notes are picked, the fill marks them instead of the open note.
  const active = picked.size > 0 ? picked.has(id) : selected === id
  const line = mark?.line?.row === id ? mark.line : null
  const into = mark?.into === id

  return (
    <>
      <div
        ref={dropRef}
        {...listeners}
        className={`relative flex select-none items-center pr-1 ${active ? 'bg-accent text-on-accent' : 'hover:bg-bg'} ${isDragging ? 'opacity-40' : ''} ${into ? `outline-2 -outline-offset-2 ${active ? 'outline-ink' : 'outline-accent-ink'}` : ''}`}
        style={{ paddingLeft: 4 + depth * INDENT }}
        data-drop-into={into || undefined}
      >
        {line && (
          <span
            data-drop-line
            className={`pointer-events-none absolute right-0 h-[3px] before:absolute before:-top-1 before:left-0 before:h-[11px] before:w-[11px] before:content-[''] ${line.edge === 'top' ? 'top-0' : 'bottom-0'} ${active ? 'bg-ink before:bg-ink' : 'bg-accent-ink before:bg-accent-ink'}`}
            style={{ left: 4 + line.depth * INDENT }}
          />
        )}
        <span
          aria-hidden
          className={`hidden h-11 w-7 shrink-0 items-center justify-center pointer-coarse:flex ${active ? 'text-on-accent/80' : 'text-ink-muted'}`}
        >
          <GripIcon className="h-5 w-5" />
        </span>
        {kids.length > 0 ? (
          <button
            type="button"
            className="flex h-11 w-7 shrink-0 items-center justify-center"
            onClick={() => toggleCollapsed(id)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <button
          ref={dragRef}
          {...attributes}
          type="button"
          aria-current={selected === id ? 'page' : undefined}
          aria-pressed={picked.has(id) || undefined}
          className="flex min-w-0 flex-1 touch-manipulation items-baseline gap-2 py-3 text-left"
          onClick={(e) => onPick(id, e)}
        >
          <NoteTitle id={id} depth={depth} active={active} />
        </button>
        <IconButton
          label="New note inside"
          className="h-11"
          onClick={() => {
            expand(id)
            showNote(createNote(id))
          }}
        >
          <PlusIcon className="size-4.5" />
        </IconButton>
      </div>
      {open &&
        kids.map((kid) => (
          <Row key={kid} id={kid} depth={depth + 1} selected={selected} picked={picked} onPick={onPick} mark={mark} />
        ))}
    </>
  )
}
