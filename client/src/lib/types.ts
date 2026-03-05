export interface User {
  id: string
  name: string
  email: string | null
}

export interface Notebook {
  id: string
  title: string
  type: 'notes' | 'tasks'
  owner_id: string
  inserted_at: string
  updated_at: string
}

export interface NoteListItem {
  id: string
  title: string
  notebook_id: string
  updated_at: string
}

export interface NoteDetail extends NoteListItem {
  content_text: string | null
  ydoc_state: string | null // base64, used in Phase 2
}

export interface Task {
  id: string
  notebook_id: string
  title: string
  notes: string | null
  completed_at: string | null
  due_at: string | null
  rrule: string | null
  next_occurrence_at: string | null
  inserted_at: string
  updated_at: string
}
