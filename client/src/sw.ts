import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, type PrecacheEntry, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { dayOf, nextDue, parseRule } from './components/dates'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] }

// The app opens offline, and a new version takes over as soon as it has downloaded.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/auth\//, /^\/socket/, /^\/s\//],
  }),
)
void self.skipWaiting()
clientsClaim()

interface Alert {
  title: string
  body: string
  note: string
  tag: string
  due: string
  text: string
  repeat: string | null
}

self.addEventListener('push', (event) => {
  const alert: Alert = event.data!.json()
  const options = {
    body: alert.body,
    tag: alert.tag,
    data: alert,
    icon: '/icons/icon-192.png',
    actions: [
      { action: 'done', title: 'Done' },
      { action: 'snooze', title: 'Snooze 1 hour' },
    ],
  }
  event.waitUntil(self.registration.showNotification(alert.title, options))
})

// Done ticks the line, or moves a repeating one to its next date, and Snooze moves it to an hour from now. The
// server makes the change, since the app may be closed. When it can't, the note opens instead.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const alert: Alert = event.notification.data
  const later = new Date(Date.now() + 60 * 60 * 1000)
  const change =
    event.action === 'done'
      ? parseRule(alert.repeat)
        ? { move_to: nextDue(alert.due, alert.repeat!) }
        : { checked: true }
      : event.action === 'snooze'
        ? { move_to: `${dayOf(later)}T${later.toTimeString().slice(0, 5)}` }
        : null
  const note = `/n/${alert.note}?${new URLSearchParams({ line: alert.text })}`
  // A running app opens the note itself, as it does for a tap.
  const open = () =>
    self.clients
      .matchAll({ type: 'window' })
      .then(([window]) =>
        window ? window.focus().then((focused) => void focused.postMessage({ open: note })) : self.clients.openWindow(note),
      )
  event.waitUntil(
    change
      ? fetch(`/api/docs/${alert.note}/line`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due: alert.due, text: alert.text, ...change }),
        })
          .then((response) => {
            if (!response.ok) return open()
          })
          .catch(open)
      : open(),
  )
})
