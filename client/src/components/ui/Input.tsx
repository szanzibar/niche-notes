import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--ink)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={[
          'px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]',
          'border-2 border-[var(--border)] outline-none w-full',
          'focus:border-[var(--accent)]',
          'placeholder:text-[var(--ink-muted)]',
          error ? 'border-red-600' : '',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
)

Input.displayName = 'Input'
