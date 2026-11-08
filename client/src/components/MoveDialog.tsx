import * as Dialog from '@radix-ui/react-dialog'
import { children, descendants, placeNote, titleOf } from '../sync/tree'
import { Button } from './Button'

export function MoveDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const skip = descendants(id)
  skip.add(id)

  const rows: { id: string; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const child of children(parent)) {
      if (skip.has(child)) continue
      rows.push({ id: child, depth })
      walk(child, depth + 1)
    }
  }
  walk(null, 0)

  const move = (parent: string | null) => {
    placeNote(id, parent)
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[80dvh] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-border bg-surface p-5 shadow-brutal">
          <Dialog.Title className="mb-3 text-lg font-bold">Move “{titleOf(id)}” to</Dialog.Title>
          <div className="flex-1 overflow-y-auto">
            <button type="button" className="block w-full py-2 text-left font-bold hover:bg-bg" onClick={() => move(null)}>
              Top level
            </button>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="block w-full truncate py-2 text-left hover:bg-bg"
                style={{ paddingLeft: row.depth * 16 }}
                onClick={() => move(row.id)}
              >
                {titleOf(row.id)}
              </button>
            ))}
          </div>
          <Dialog.Close asChild>
            <Button className="mt-4 w-full">Cancel</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
