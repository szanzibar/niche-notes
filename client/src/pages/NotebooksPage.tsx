import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Input } from '../components/ui'
import { api } from '../lib/api'
import type { Notebook } from '../lib/types'

export function NotebooksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'notes' | 'tasks'>('notes')

  const { data, isLoading } = useQuery({
    queryKey: ['notebooks'],
    queryFn: () => api.notebooks.list(),
  })

  const create = useMutation({
    mutationFn: () => api.notebooks.create({ title, type }),
    onSuccess: ({ notebook }) => {
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      setOpen(false)
      setTitle('')
      navigate(`/notebooks/${notebook.id}`)
    },
  })

  return (
    <div className="min-h-screen bg-[var(--base)] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Notebooks</h1>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button variant="primary">New Notebook</Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--base)] border-2 border-[var(--ink)] shadow-[var(--shadow)] p-6 w-full max-w-sm">
                <Dialog.Title className="text-lg font-bold text-[var(--ink)] mb-4">
                  New Notebook
                </Dialog.Title>
                <form
                  onSubmit={(e) => { e.preventDefault(); create.mutate() }}
                  className="flex flex-col gap-4"
                >
                  <Input
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                    required
                  />
                  <div className="flex gap-2">
                    {(['notes', 'tasks'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={[
                          'flex-1 py-2 border-2 border-[var(--ink)] font-medium capitalize text-sm transition-colors',
                          type === t
                            ? 'bg-[var(--accent)] text-white'
                            : 'bg-[var(--base)] text-[var(--ink)]',
                        ].join(' ')}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Dialog.Close asChild>
                      <Button variant="ghost">Cancel</Button>
                    </Dialog.Close>
                    <Button variant="primary" type="submit" disabled={!title.trim() || create.isPending}>
                      Create
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        {isLoading && <p className="text-[var(--ink-muted)]">Loading…</p>}

        <div className="flex flex-col gap-3">
          {data?.notebooks.map((nb: Notebook) => (
            <Card
              key={nb.id}
              onClick={() => navigate(`/notebooks/${nb.id}`)}
              className="cursor-pointer hover:bg-[var(--accent)] hover:text-white transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--ink)] group-hover:text-white">{nb.title}</span>
                <Badge variant={nb.type === 'tasks' ? 'accent' : 'default'}>{nb.type}</Badge>
              </div>
            </Card>
          ))}
          {data?.notebooks.length === 0 && (
            <p className="text-[var(--ink-muted)] text-center py-12">
              No notebooks yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
