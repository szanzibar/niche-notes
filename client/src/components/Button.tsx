import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }

const styles = {
  default: 'border-border bg-surface text-ink shadow-brutal',
  primary: 'border-border bg-accent text-white shadow-brutal',
  ghost: 'border-transparent bg-transparent text-ink',
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
