import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useStore, useY } from '../sync/hooks'
import { wipeLocal } from '../sync/store'
import {
  children,
  createNote,
  deleteNote,
  meta,
  nodes,
  ownerOf,
  placeNote,
  removeFromTree,
  sharedWithMeUnplaced,
  titleOf,
} from '../sync/tree'
import { Button } from './Button'
import { MoveDialog } from './MoveDialog'

export function Tree({ selected }: { selected?: string }) {
  const s = useStore()
  const navigate = useNavigate()
  useY(nodes())
  const roots = children(null)
  const shared = sharedWithMeUnplaced()

  const signOut = async () => {
    await api.logout()
    await wipeLocal()
    window.location.href = '/auth/login'
  }

  return (
    <>
      <header className="flex items-center justify-between border-b-2 border-border px-4 py-3">
        <h1 className="text-xl font-bold">Notes</h1>
        <Button variant="primary" onClick={() => navigate(`/n/${createNote(null)}`)}>
          + New
        </Button>
      </header>
      <nav className="flex-1 overflow-y-auto">
        {roots.length === 0 && shared.length === 0 && (
          <p className="p-6 text-ink-muted">No notes yet. Tap New.</p>
        )}
        {roots.map((id) => (
          <Row key={id} id={id} depth={0} selected={selected} />
        ))}
        {shared.length > 0 && (
          <h2 className="px-4 pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Shared with me
          </h2>
        )}
        {shared.map((id) => (
          <Row key={id} id={id} depth={0} selected={selected} unplaced />
        ))}
      </nav>
      <footer className="flex items-center gap-2 border-t-2 border-border px-4 py-2 text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 border-2 border-border ${s.online ? 'bg-green-500' : 'bg-bg'}`}
          title={s.online ? 'Online' : 'Offline'}
        />
        <span className="flex-1 truncate">{s.me!.name}</span>
        <button type="button" className="underline" onClick={signOut}>
          Sign out
        </button>
      </footer>
    </>
  )
}

function Row({ id, depth, selected, unplaced }: { id: string; depth: number; selected?: string; unplaced?: boolean }) {
  const navigate = useNavigate()
  const s = useStore()
  useY(meta(id))
  const [open, setOpen] = useState(true)
  const [moving, setMoving] = useState(false)
  const kids = unplaced ? [] : children(id)
  const active = selected === id
  const mine = ownerOf(id) === s.me!.id

  return (
    <>
      <div
        className={`flex items-center pr-1 ${active ? 'bg-accent text-white' : 'hover:bg-bg'}`}
        style={{ paddingLeft: 4 + depth * 16 }}
      >
        <button
          type="button"
          className="h-11 w-7 shrink-0 text-xs"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {kids.length > 0 ? (open ? '▼' : '▶') : ''}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate py-3 text-left font-medium"
          onClick={() => navigate(`/n/${id}`)}
        >
          {titleOf(id)}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="h-11 w-10 shrink-0 text-xl leading-none" aria-label="Note menu">
              ⋯
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="min-w-48 border-2 border-border bg-surface p-1 text-ink shadow-brutal">
              {unplaced ? (
                <Item onSelect={() => placeNote(id, null)}>Add to my notes</Item>
              ) : (
                <>
                  <Item onSelect={() => navigate(`/n/${createNote(id)}`)}>New note inside</Item>
                  <Item onSelect={() => setMoving(true)}>Move to…</Item>
                  {mine ? (
                    <Item
                      onSelect={() => {
                        if (!confirm('Delete this note?')) return
                        deleteNote(id)
                        if (active) navigate('/')
                      }}
                    >
                      Delete
                    </Item>
                  ) : (
                    <Item onSelect={() => removeFromTree(id)}>Remove from my notes</Item>
                  )}
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {moving && <MoveDialog id={id} onClose={() => setMoving(false)} />}
      {open && kids.map((kid) => <Row key={kid} id={kid} depth={depth + 1} selected={selected} />)}
    </>
  )
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      className="cursor-pointer px-3 py-2 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white"
      onSelect={onSelect}
    >
      {children}
    </DropdownMenu.Item>
  )
}
