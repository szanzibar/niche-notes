import { api } from './api'

// Null where the browser has no Web Push, so alerts can't be turned on here.
export const alertPermission = () => ('PushManager' in window ? Notification.permission : null)

// Asked when the first date is set on this device, since that is when alerts start to matter.
export async function enableAlerts() {
  if (alertPermission() === 'default') await Notification.requestPermission()
  await registerAlerts()
}

// Every launch sends this device's subscription again, so the server knows its current time zone.
export async function registerAlerts() {
  if (alertPermission() !== 'granted') return
  const { pushManager } = await navigator.serviceWorker.ready
  const subscription =
    (await pushManager.getSubscription()) ??
    (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: (await api.pushKey()).key }))
  await api.subscribe(subscription.toJSON(), Intl.DateTimeFormat().resolvedOptions().timeZone)
}
