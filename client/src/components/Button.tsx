import type { ButtonHTMLAttributes } from 'react'

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

// A word, where no icon reads clearly. A choice among words passes aria-pressed, and the chosen one wears the accent.
export function Button({ className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const choice = props['aria-pressed'] != null
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center whitespace-nowrap font-bold disabled:opacity-50 ${choice ? 'px-3 aria-pressed:bg-accent aria-pressed:text-on-accent' : 'underline underline-offset-4'} ${className}`}
      {...props}
    />
  )
}
