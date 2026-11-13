import type { Share, User } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (res.status === 401) {
    window.location.href = '/auth/login'
    throw new Error('unauthenticated')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (res.status === 201 || res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  me: () => request<{ user: User; token: string }>('/me'),
  users: () => request<{ users: User[] }>('/users'),
  shares: () => request<{ shares: Share[] }>('/shares'),
  share: (docId: string, userId: string) =>
    request<void>(`/docs/${docId}/shares`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  deleteDoc: (docId: string) => request<void>(`/docs/${docId}`, { method: 'DELETE' }),
  unshare: (docId: string, userId: string) =>
    request<void>(`/docs/${docId}/shares/${userId}`, { method: 'DELETE' }),
  widgetToken: (docId: string) => request<{ token: string }>(`/docs/${docId}/widget_token`),
  pushKey: () => request<{ key: string }>('/push_key'),
  subscribe: (subscription: PushSubscriptionJSON, timeZone: string) =>
    request<void>('/push_subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ subscription, time_zone: timeZone }),
    }),
  calendar: () => request<{ url: string }>('/calendar'),
  logout: () => fetch('/auth/logout', { method: 'DELETE' }),
}
