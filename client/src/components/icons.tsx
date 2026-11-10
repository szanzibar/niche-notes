const base = {
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function PinIcon({ filled, className = 'h-[22px] w-[22px]' }: { filled?: boolean; className?: string }) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

export function TrashIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg {...base} className={className} fill="none">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  )
}

export function LeaveIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg {...base} className={className} fill="none">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

export function UsersIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg {...base} className={className} fill="none">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function CloudOffIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg {...base} className={className} fill="none">
      <path d="M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057" />
      <path d="M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78" />
      <path d="m2 2 20 20" />
    </svg>
  )
}
