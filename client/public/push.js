// Alerts for dated lines. A tap opens the line's note, in the app's window when one is open.
self.addEventListener('push', (event) => {
  const { title, body, note, tag } = event.data.json()
  event.waitUntil(self.registration.showNotification(title, { body, tag, data: { note }, icon: '/icons/icon-192.png' }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = `/n/${event.notification.data.note}`
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then(([open]) => (open ? open.focus().then((window) => window.navigate(url)) : self.clients.openWindow(url))),
  )
})
