import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { useStore } from '../sync/hooks'
import { refreshSharing } from '../sync/store'
import { Button, IconButton } from './Button'
import { UserPlusIcon, UsersIcon } from './icons'

export function ShareDialog({ id }: { id: string }) {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    if (!open) return
    api
      .users()
      .then(({ users }) => setUsers(users.filter((u) => u.id !== s.me!.id)))
      .catch(() => setUsers([]))
  }, [open, s.me])

  const sharedWith = new Set(s.shares.filter((x) => x.doc_id === id).map((x) => x.user_id))
  const toggle = (user: User) =>
    (sharedWith.has(user.id) ? api.unshare(id, user.id) : api.share(id, user.id)).then(refreshSharing)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {sharedWith.size > 0 ? (
          <IconButton label={`Shared with ${sharedWith.size}`} className="px-1 text-accent">
            <UsersIcon />
            <span className="font-bold">{sharedWith.size}</span>
          </IconButton>
        ) : (
          <IconButton label="Share">
            <UserPlusIcon />
          </IconButton>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 border-2 border-border bg-surface p-5 shadow-brutal"
        >
          <Dialog.Title className="mb-3 text-lg font-bold">Share this note</Dialog.Title>
          {users.length === 0 && (
            <p className="text-ink-muted">
              {s.online ? 'Nobody else has signed in yet.' : 'Sharing needs a connection.'}
            </p>
          )}
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{user.name}</span>
                <Button variant={sharedWith.has(user.id) ? 'primary' : 'default'} onClick={() => void toggle(user)}>
                  {sharedWith.has(user.id) ? 'Shared' : 'Share'}
                </Button>
              </li>
            ))}
          </ul>
          <Dialog.Close asChild>
            <Button className="mt-4 w-full">Done</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
