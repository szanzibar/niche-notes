import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Link, User } from '../lib/types'
import { useStore } from '../sync/hooks'
import { refreshSharing } from '../sync/store'
import { Button, IconButton } from './Button'
import { CheckIcon, CloseIcon, EditIcon, ShareIcon, UsersIcon, ViewIcon } from './icons'
import { Info } from './Popover'

const day = (at: string) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function ShareDialog({ id }: { id: string }) {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  const reload = useCallback(
    () =>
      api
        .links(id)
        .then(({ links }) => setLinks(links))
        .catch(() => setLinks([])),
    [id],
  )
  useEffect(() => {
    if (!open) return
    api
      .users()
      .then(({ users }) => setUsers(users.filter((u) => u.id !== s.me!.id)))
      .catch(() => setUsers([]))
    void reload()
  }, [open, s.me, reload])

  const shares = s.shares.filter((x) => x.doc_id === id)
  const sharedWith = new Set(shares.map((x) => x.user_id))
  const viewers = new Set(shares.filter((x) => x.read_only).map((x) => x.user_id))
  const toggle = (user: User) =>
    (sharedWith.has(user.id) ? api.unshare(id, user.id) : api.share(id, user.id)).then(refreshSharing)
  const people = users.filter((u) => !u.guest)
  // A phone hands the link to its share sheet, to send in a message. Elsewhere it goes to the clipboard.
  const sheet = 'share' in navigator
  const send = (token: string) => {
    const url = `${location.origin}/s/${token}`
    return sheet
      ? navigator.share({ url }).catch(() => {})
      : navigator.clipboard.writeText(url).then(() => setCopied(token))
  }
  // The token is made here, so the share sheet opens in the tap while the server stores the link.
  const create = (readOnly: boolean) => {
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
    void send(token)
    void api.createLink(id, token, readOnly).then(reload)
  }
  const turnOff = (token: string) =>
    api
      .deleteLink(id, token)
      .then(() => setLinks((links) => links.filter((link) => link.token !== token)))
      .then(refreshSharing)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setCopied(null)
      }}
    >
      <Dialog.Trigger asChild>
        {sharedWith.size > 0 ? (
          <IconButton label={`Shared with ${sharedWith.size}`} className="px-1 text-accent-ink">
            <UsersIcon filled />
            <span className="font-bold">{sharedWith.size}</span>
          </IconButton>
        ) : (
          <IconButton label="Share">
            <UsersIcon />
          </IconButton>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-2 border-border bg-surface p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Share this note</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" className="-mr-2.5">
                <CloseIcon />
              </IconButton>
            </Dialog.Close>
          </div>
          {people.length === 0 && (
            <p className="text-ink-muted">
              {s.online ? 'Nobody else has signed in yet.' : 'Sharing needs a connection.'}
            </p>
          )}
          <ul className="-mx-3 flex flex-col">
            {people.map((user) => (
              <li key={user.id}>
                <Button
                  aria-pressed={sharedWith.has(user.id)}
                  className="w-full justify-between gap-3"
                  onClick={() => void toggle(user)}
                >
                  <span className="truncate">{user.name}</span>
                  {viewers.has(user.id) ? <ViewIcon /> : <UsersIcon filled={sharedWith.has(user.id)} />}
                </Button>
              </li>
            ))}
          </ul>
          <section className="mt-4 border-t-2 border-border pt-2">
            <div className="flex items-center">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Links</p>
              <Info label="About links">
                Anyone with an edit link can change this note without an account, and anyone with a read link can
                read it. Turning a link off takes the note away from the guests who came by it.
              </Info>
            </div>
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.token} className="pb-2">
                  <div className="flex items-center gap-2.5">
                    {link.read_only ? <ViewIcon /> : <EditIcon />}
                    <span className="flex-1 font-bold">
                      {link.read_only ? 'Can read' : 'Can edit'}{' '}
                      <span className="font-normal text-ink-muted">· {day(link.at)}</span>
                    </span>
                    <IconButton label="Share this link" onClick={() => void send(link.token)}>
                      {copied === link.token ? <CheckIcon /> : <ShareIcon />}
                    </IconButton>
                    <Button disabled={!s.online} onClick={() => void turnOff(link.token)}>
                      Turn off
                    </Button>
                  </div>
                  <ul className="ml-8 flex flex-col text-sm text-ink-muted">
                    {link.visitors.length === 0 && <li>Nobody yet</li>}
                    {link.visitors.map((visitor) => (
                      <li key={visitor.name + visitor.at} className="flex justify-between gap-3">
                        <span className="truncate">{visitor.name}</span>
                        <span>{day(visitor.at)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-2 flex flex-wrap items-center gap-x-3 border-t-2 border-border pt-2">
            <Button className="gap-2" disabled={!s.online} onClick={() => create(false)}>
              <ShareIcon />
              New edit link
            </Button>
            <span aria-hidden className="h-6 w-0.5 bg-border" />
            <Button className="gap-2" disabled={!s.online} onClick={() => create(true)}>
              <ShareIcon />
              New read link
            </Button>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
