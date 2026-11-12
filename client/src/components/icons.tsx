const base = {
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const SIZE = 'h-[22px] w-[22px]'

// One stroked path on a 24-unit square, in the text color. Circles are drawn as two arcs.
function icon(d: string) {
  return function Icon({ className = SIZE }: { className?: string }) {
    return (
      <svg {...base} className={className} fill="none" aria-hidden>
        <path d={d} />
      </svg>
    )
  }
}

export function PinIcon({ filled, className = SIZE }: { filled?: boolean; className?: string }) {
  return (
    <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'} aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

export const TrashIcon = icon('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')
export const LeaveIcon = icon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9')
export const UsersIcon = icon(
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
)
export const UserPlusIcon = icon(
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0M19 8v6M22 11h-6',
)
export const CloudOffIcon = icon(
  'M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78M2 2l20 20',
)
export const PlusIcon = icon('M5 12h14M12 5v14')
export const CheckedIcon = icon('M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 12l3 3 5-6')
export const HideCheckedIcon = icon('M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 12l3 3 5-6M2 2l20 20')
export const DeleteCheckedIcon = icon('M11 12H3M16 6H3M16 18H3M19 10l-4 4M15 10l4 4')
export const UncheckAllIcon = icon('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M9 9h6v6H9z')
export const SettingsIcon = icon('M20 7h-9M14 17H5M20 17a3 3 0 1 1-6 0a3 3 0 1 1 6 0M10 7a3 3 0 1 1-6 0a3 3 0 1 1 6 0')

// The editor's toolbar.
export const ChecklistIcon = icon('M3 7l2 2 4-4M3 17l2 2 4-4M13 6h8M13 12h8M13 18h8')
export const BulletListIcon = icon('M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13')
export const NumberedListIcon = icon('M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1')
export const OutdentIcon = icon('M21 6H11M21 12H11M21 18H11M7 8l-4 4 4 4')
export const IndentIcon = icon('M21 6H11M21 12H11M21 18H11M3 8l4 4-4 4')
export const HeadingIcon = icon('M6 12h12M6 20V4M18 20V4')
export const QuoteIcon = icon(
  'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2zM5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
)
export const DividerIcon = icon('M3 12h18M8 8l4-4 4 4M16 16l-4 4-4-4')
export const BoldIcon = icon('M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8')
export const ItalicIcon = icon('M19 4h-9M14 20H5M15 4L9 20')
export const StrikeIcon = icon('M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16')
export const CodeIcon = icon('M16 18l6-6-6-6M8 6l-6 6 6 6')
export const CodeBlockIcon = icon(
  'M10 9.5L8 12l2 2.5M14 9.5l2 2.5-2 2.5M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
)
export const LinkIcon = icon(
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
)
export const UnlinkIcon = icon(
  'M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71M8 2v3M2 8h3M16 22v-3M22 16h-3',
)
export const OpenLinkIcon = icon('M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')
export const CheckIcon = icon('M20 6L9 17l-5-5')
export const GripIcon = icon('M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01')
export const HighlightIcon = icon('M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4')
export const UndoIcon = icon('M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11')
export const RedoIcon = icon('M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13')
