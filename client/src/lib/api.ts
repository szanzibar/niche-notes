import type { Link, Share, User } from './types'

// A page's requests fail together, and only one sign-in may start, since each one replaces the last one's state and
// the app's sign-in that comes back from the browser then fails.
let signingIn = false

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (res.status === 401) {
    if (!signingIn) window.location.href = '/auth/login'
    signingIn = true
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
  history: (docId: string) => request<{ rows: [number, string | null, string][] }>(`/docs/${docId}/history`),
  widgetToken: (docId: string) => request<{ token: string }>(`/docs/${docId}/widget_token`),
  links: (docId: string) => request<{ links: Link[] }>(`/docs/${docId}/links`),
  createLink: (docId: string, token: string, readOnly: boolean) =>
    request<void>(`/docs/${docId}/links`, { method: 'POST', body: JSON.stringify({ token, read_only: readOnly }) }),
  deleteLink: (docId: string, token: string) => request<void>(`/docs/${docId}/links/${token}`, { method: 'DELETE' }),
  pushKey: () => request<{ key: string }>('/push_key'),
  subscribe: (subscription: PushSubscriptionJSON, timeZone: string) =>
    request<void>('/push_subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ subscription, time_zone: timeZone }),
    }),
  googleCalendar: () => request<{ email: string | null }>('/google_calendar'),
  disconnectGoogleCalendar: () => request<void>('/google_calendar', { method: 'DELETE' }),
  logout: () => fetch('/auth/logout', { method: 'DELETE' }),
}
