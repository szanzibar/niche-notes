import { useStore } from '../sync/hooks'
import { CloudOffIcon } from './icons'

export function OfflineIcon() {
  const s = useStore()
  if (s.online !== false) return null
  return (
    <span
      role="img"
      aria-label="Offline"
      title="Offline: changes save on this device and sync when you're back online"
      className="shrink-0"
    >
      <CloudOffIcon />
    </span>
  )
}
