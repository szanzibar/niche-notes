import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Collaboration from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useNoteSync } from '../sync/useNoteSync'

export function NotePage() {
  const { notebookId, noteId } = useParams<{ notebookId: string; noteId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['note', notebookId, noteId],
    queryFn: () => api.notes.get(notebookId as string, noteId as string),
    enabled: !!notebookId && !!noteId,
  })

  const [title, setTitle] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    if (data && !initialized.current) {
      setTitle(data.note.title)
      initialized.current = true
    }
  }, [data])

  const saveTitle = useMutation({
    mutationFn: (t: string) =>
      api.notes.update(notebookId as string, noteId as string, { title: t }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', notebookId] }),
  })

  const { doc } = useNoteSync(noteId ?? '')

  const editor = useEditor({
    extensions: [
      // Disable built-in history — Y.js handles undo/redo.
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
    ],
  })

  if (isLoading) return <div className="p-6 text-ink-muted">Loading…</div>
  if (!notebookId || !noteId) return null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="border-b-2 border-border px-6 py-3 flex items-center gap-4 bg-surface">
        <button
          type="button"
          onClick={() => navigate(`/notebooks/${notebookId}`)}
          className="text-ink-muted text-sm hover:text-ink cursor-pointer"
        >
          ←
        </button>
        <input
          className="flex-1 text-lg font-bold text-ink bg-transparent outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveTitle.mutate(title)}
          placeholder="Untitled"
        />
        {saveTitle.isPending && <span className="text-xs text-ink-muted">Saving…</span>}
      </div>

      {/* TipTap WYSIWYG editor — content synced via Y.js Phoenix Channel */}
      <EditorContent
        editor={editor}
        className="flex-1 p-6 text-ink bg-bg text-sm leading-relaxed
          [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[calc(100vh-56px)]
          [&_.ProseMirror_p]:mb-3
          [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-3
          [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mb-2
          [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:mb-2
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:mb-3
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:mb-3
          [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-ink-muted
          [&_.ProseMirror_code]:bg-surface [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-['Start_writing…'] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-muted [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  )
}
