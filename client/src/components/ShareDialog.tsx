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
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    api
      .users()
      .then(({ users }) => setUsers(users.filter((u) => u.id !== s.me!.id)))
      .catch(() => setUsers([]))
    api
      .link(id)
      .then(({ link }) => setLink(link))
      .catch(() => setLink(null))
  }, [open, s.me, id])

  const sharedWith = new Set(s.shares.filter((x) => x.doc_id === id).map((x) => x.user_id))
  const toggle = (user: User) =>
    (sharedWith.has(user.id) ? api.unshare(id, user.id) : api.share(id, user.id)).then(refreshSharing)
  const people = users.filter((u) => !u.guest)
  const guests = users.filter((u) => u.guest && sharedWith.has(u.id))
  const url = link && `${location.origin}/s/${link}`
  // A phone hands the link to its share sheet, to send in a message. Elsewhere it goes to the clipboard.
  const sheet = 'share' in navigator
  const send = () =>
    sheet
      ? navigator.share({ url: url! }).catch(() => {})
      : navigator.clipboard.writeText(url!).then(() => setCopied(true))

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setCopied(false)
      }}
    >
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
          className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-border bg-surface p-5 shadow-brutal"
        >
          <Dialog.Title className="mb-3 text-lg font-bold">Share this note</Dialog.Title>
          {people.length === 0 && (
            <p className="text-ink-muted">
              {s.online ? 'Nobody else has signed in yet.' : 'Sharing needs a connection.'}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {people.map((user) => (
              <li key={user.id} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{user.name}</span>
                <Button variant={sharedWith.has(user.id) ? 'primary' : 'default'} onClick={() => void toggle(user)}>
                  {sharedWith.has(user.id) ? 'Shared' : 'Share'}
                </Button>
              </li>
            ))}
          </ul>
          <section className="mt-4 flex flex-col gap-2 border-t-2 border-border pt-4">
            <p className="font-bold">Anyone with the link can edit, no account needed.</p>
            {url ? (
              <>
                <div className="flex gap-2">
                  <input
                    readOnly
                    aria-label="Link"
                    value={url}
                    className="min-w-0 flex-1 border-2 border-border bg-bg px-2 outline-none"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button onClick={() => void send()}>{sheet ? 'Send' : copied ? 'Copied' : 'Copy'}</Button>
                </div>
                {guests.length > 0 && (
                  <p className="text-sm text-ink-muted">Opened by {guests.map((u) => u.name).join(', ')}</p>
                )}
                <Button
                  onClick={() =>
                    void api
                      .deleteLink(id)
                      .then(() => setLink(null))
                      .then(refreshSharing)
                  }
                >
                  Turn off
                </Button>
              </>
            ) : (
              <Button disabled={!s.online} onClick={() => void api.createLink(id).then(({ link }) => setLink(link))}>
                Create link
              </Button>
            )}
          </section>
          <Dialog.Close asChild>
            <Button className="mt-4 w-full">Done</Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
