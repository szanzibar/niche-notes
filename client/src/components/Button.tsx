import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }

const styles = {
  default: 'border-border bg-surface text-ink shadow-brutal',
  primary: 'border-border bg-accent text-white shadow-brutal',
  ghost: 'border-transparent bg-transparent text-ink',
}

// Icons over words: the label is the button's name for screen readers and its tooltip.
export function IconButton({
  label,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 ${className}`}
      {...props}
    />
  )
}

export function Button({ variant = 'default', className = '', type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center justify-center whitespace-nowrap border-2 px-3 font-bold active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  )
}
