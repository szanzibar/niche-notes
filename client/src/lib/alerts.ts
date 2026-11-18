import { api } from './api'

// Turned off on this device in Settings, though the browser still allows them, as where the desktop app alerts too.
const OFF = 'alertsOff'

// Null where the browser has no Web Push, so alerts can't be turned on here.
export const alertState = () =>
  'PushManager' in window ? (Notification.permission === 'granted' && localStorage.getItem(OFF) ? 'off' : Notification.permission) : null

// Asked when the first date is set on this device, since that is when alerts start to matter.
export async function enableAlerts() {
  if (alertState() === 'default') await Notification.requestPermission()
  await registerAlerts()
}

export async function turnOnAlerts() {
  localStorage.removeItem(OFF)
  await enableAlerts()
}

// The push service then refuses the server's next alert for this device, and the server forgets it.
export async function turnOffAlerts() {
  localStorage.setItem(OFF, 'yes')
  const { pushManager } = await navigator.serviceWorker.ready
  await (await pushManager.getSubscription())?.unsubscribe()
}

// Every launch sends this device's subscription again, so the server knows its current time zone.
export async function registerAlerts() {
  if (alertState() !== 'granted') return
  const { pushManager } = await navigator.serviceWorker.ready
  const subscription =
    (await pushManager.getSubscription()) ??
    (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: (await api.pushKey()).key }))
  await api.subscribe(subscription.toJSON(), Intl.DateTimeFormat().resolvedOptions().timeZone)
}
