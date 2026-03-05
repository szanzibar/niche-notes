import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Input } from '../components/ui'
import { api } from '../lib/api'
import type { NoteListItem, Task } from '../lib/types'

export function NotebookPage() {
  const { notebookId } = useParams<{ notebookId: string }>()
  const navigate = useNavigate()

  const { data: nbData, isLoading } = useQuery({
    queryKey: ['notebook', notebookId],
    queryFn: () => api.notebooks.get(notebookId as string),
    enabled: !!notebookId,
  })

  if (isLoading) return <div className="p-6 text-ink-muted">Loading…</div>
  if (!nbData || !notebookId) return null

  const nb = nbData.notebook

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => navigate('/notebooks')}
          className="text-ink-muted text-sm mb-4 hover:text-ink cursor-pointer"
        >
          ← Notebooks
        </button>
        <h1 className="text-2xl font-bold text-ink mb-6">{nb.title}</h1>
        {nb.type === 'notes' ? (
          <NotesView notebookId={notebookId} />
        ) : (
          <TasksView notebookId={notebookId} />
        )}
      </div>
    </div>
  )
}

function NotesView({ notebookId }: { notebookId: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notes', notebookId],
    queryFn: () => api.notes.list(notebookId),
  })

  const create = useMutation({
    mutationFn: () => api.notes.create(notebookId, { title: 'Untitled' }),
    onSuccess: ({ note }) => {
      qc.invalidateQueries({ queryKey: ['notes', notebookId] })
      navigate(`/notebooks/${notebookId}/notes/${note.id}`)
    },
  })

  if (isLoading) return <p className="text-ink-muted">Loading…</p>

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          New Note
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {data?.notes.map((note: NoteListItem) => (
          <button
            key={note.id}
            type="button"
            onClick={() => navigate(`/notebooks/${notebookId}/notes/${note.id}`)}
            className="text-left p-4 border-2 border-border bg-surface hover:bg-accent hover:border-accent transition-colors group"
          >
            <div className="font-medium text-ink group-hover:text-white">
              {note.title || 'Untitled'}
            </div>
            <div className="text-xs text-ink-muted group-hover:text-white/80 mt-0.5">
              {new Date(note.updated_at).toLocaleDateString()}
            </div>
          </button>
        ))}
        {data?.notes.length === 0 && (
          <p className="text-ink-muted text-center py-12">No notes yet.</p>
        )}
      </div>
    </div>
  )
}

function TasksView({ notebookId }: { notebookId: string }) {
  const qc = useQueryClient()
  const [newTitle, setNewTitle] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', notebookId],
    queryFn: () => api.tasks.list(notebookId),
  })

  const create = useMutation({
    mutationFn: (title: string) => api.tasks.create(notebookId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', notebookId] })
      setNewTitle('')
    },
  })

  const toggle = useMutation({
    mutationFn: (task: Task) =>
      api.tasks.update(notebookId, task.id, {
        completed_at: task.completed_at ? null : new Date().toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', notebookId] }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.tasks.delete(notebookId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', notebookId] }),
  })

  if (isLoading) return <p className="text-ink-muted">Loading…</p>

  const tasks = data?.tasks ?? []
  const pending = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (newTitle.trim()) create.mutate(newTitle.trim())
        }}
        className="flex gap-2 mb-6"
      >
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New task…"
          className="flex-1"
        />
        <Button variant="primary" type="submit" disabled={!newTitle.trim() || create.isPending}>
          Add
        </Button>
      </form>

      <div className="flex flex-col gap-1">
        {pending.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={() => toggle.mutate(task)}
            onDelete={() => remove.mutate(task.id)}
          />
        ))}
        {done.length > 0 && (
          <>
            <p className="text-xs text-ink-muted mt-4 mb-1 font-medium uppercase tracking-wide">
              Done
            </p>
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => toggle.mutate(task)}
                onDelete={() => remove.mutate(task.id)}
              />
            ))}
          </>
        )}
        {tasks.length === 0 && (
          <p className="text-ink-muted text-center py-12">No tasks yet.</p>
        )}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 p-3 border-2 border-border bg-surface group">
      <input
        type="checkbox"
        checked={!!task.completed_at}
        onChange={onToggle}
        className="w-4 h-4 accent-accent cursor-pointer"
      />
      <span
        className={[
          'flex-1 text-sm text-ink',
          task.completed_at ? 'line-through text-ink-muted' : '',
        ].join(' ')}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-600 cursor-pointer text-lg leading-none transition-opacity"
        aria-label="Delete task"
      >
        ×
      </button>
    </div>
  )
}
