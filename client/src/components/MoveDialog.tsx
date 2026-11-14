import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useY } from '../sync/hooks'
import { search } from '../sync/search'
import { children, inTrash, isMine, nodes, ownerName, titleOf } from '../sync/tree'

// Asks which note a line moves to: every note in tree order, indented like the tree, or the notes a search finds.
// The note the line is in shows too, so the tree keeps its shape, but can't be picked.
export function MoveDialog({ note, onPick, onClose }: { note: string; onPick: (id: string) => void; onClose: () => void }) {
  useY(nodes())
  const [query, setQuery] = useState('')
  const rows: [string, number][] = []
  const walk = (parent: string | null, depth: number) => {
    for (const id of children(parent)) {
      rows.push([id, depth])
      walk(id, depth + 1)
    }
  }
  if (!query) walk(null, 0)
  else for (const { id } of search(query)) if (!inTrash(id)) rows.push([id, 0])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        {/* No keyboard on open, since most moves are a tap on a note already in view. */}
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 flex max-h-[80dvh] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-border bg-surface shadow-brutal"
        >
          <Dialog.Title className="px-4 pt-4 text-lg font-bold">Move to note</Dialog.Title>
          <input
            type="search"
            placeholder="Find a note"
            aria-label="Find a note"
            className="mx-4 my-3 border-2 border-border bg-bg px-3 py-2 outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="overflow-y-auto border-t-2 border-border pb-2">
            {rows.map(([id, depth]) => (
              <li key={id}>
                <button
                  type="button"
                  disabled={id === note}
                  className="flex w-full items-baseline gap-2 py-2.5 pr-4 text-left hover:bg-bg disabled:text-ink-muted disabled:hover:bg-transparent"
                  style={{ paddingLeft: 16 + depth * 16 }}
                  onClick={() => onPick(id)}
                >
                  <span className="truncate font-medium">{titleOf(id)}</span>
                  {!isMine(id) && <span className="shrink-0 text-xs text-ink-muted">{ownerName(id)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
