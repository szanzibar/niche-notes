import type { HTMLAttributes } from 'react'

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        'bg-[var(--surface)] border-2 border-[var(--border)]',
        'shadow-[var(--shadow)] p-4',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
