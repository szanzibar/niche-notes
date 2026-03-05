import { type ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const styles: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white border-[var(--border)] hover:bg-[var(--accent-dark)]',
  secondary: 'bg-[var(--surface)] text-[var(--ink)] border-[var(--border)] hover:bg-[var(--bg)]',
  ghost: 'bg-transparent text-[var(--ink)] border-transparent shadow-none hover:bg-[var(--bg)]',
  danger: 'bg-red-600 text-white border-[var(--border)] hover:bg-red-700',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2',
        'px-4 py-2 font-medium text-sm',
        'border-2 cursor-pointer',
        'shadow-[var(--shadow)]',
        'transition-colors duration-100',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        'focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2',
        styles[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
)

Button.displayName = 'Button'
