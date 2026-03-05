import type { Notebook, NoteDetail, NoteListItem, Task, User } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (res.status === 401) {
    window.location.href = '/auth/login'
    throw new Error('Unauthenticated')
  }

  if (res.status === 204) return undefined as T

  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export const api = {
  me: () => request<{ user: User }>('/me'),

  notebooks: {
    list: () => request<{ notebooks: Notebook[] }>('/notebooks'),
    get: (id: string) => request<{ notebook: Notebook }>(`/notebooks/${id}`),
    create: (data: { title: string; type: string }) =>
      request<{ notebook: Notebook }>('/notebooks', {
        method: 'POST',
        body: JSON.stringify({ notebook: data }),
      }),
    update: (id: string, data: { title: string }) =>
      request<{ notebook: Notebook }>(`/notebooks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ notebook: data }),
      }),
    delete: (id: string) => request<void>(`/notebooks/${id}`, { method: 'DELETE' }),
  },

  notes: {
    list: (notebookId: string) =>
      request<{ notes: NoteListItem[] }>(`/notebooks/${notebookId}/notes`),
    get: (notebookId: string, id: string) =>
      request<{ note: NoteDetail }>(`/notebooks/${notebookId}/notes/${id}`),
    create: (notebookId: string, data: { title: string }) =>
      request<{ note: NoteDetail }>(`/notebooks/${notebookId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: data }),
      }),
    update: (notebookId: string, id: string, data: { title?: string; content_text?: string }) =>
      request<{ note: NoteDetail }>(`/notebooks/${notebookId}/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ note: data }),
      }),
    delete: (notebookId: string, id: string) =>
      request<void>(`/notebooks/${notebookId}/notes/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (notebookId: string) =>
      request<{ tasks: Task[] }>(`/notebooks/${notebookId}/tasks`),
    create: (notebookId: string, data: { title: string; due_at?: string }) =>
      request<{ task: Task }>(`/notebooks/${notebookId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ task: data }),
      }),
    update: (notebookId: string, id: string, data: Partial<Pick<Task, 'title' | 'completed_at' | 'due_at' | 'rrule'>>) =>
      request<{ task: Task }>(`/notebooks/${notebookId}/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ task: data }),
      }),
    delete: (notebookId: string, id: string) =>
      request<void>(`/notebooks/${notebookId}/tasks/${id}`, { method: 'DELETE' }),
  },
}
