import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent'
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  const variantClass = variant === 'accent'
    ? 'bg-[var(--accent)] text-white border-[var(--border)]'
    : 'bg-[var(--bg)] text-[var(--ink)] border-[var(--border)]'

  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-xs font-medium border-2',
        variantClass,
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
