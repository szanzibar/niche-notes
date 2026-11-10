import { useStore } from '../sync/hooks'

export function OfflineTag() {
  const s = useStore()
  if (s.online !== false) return null
  return (
    <span
      title="Changes save on this device and sync when you're back online"
      className="shrink-0 border-2 border-border bg-ink px-1.5 text-xs font-bold uppercase tracking-wide text-surface"
    >
      Offline
    </span>
  )
}
