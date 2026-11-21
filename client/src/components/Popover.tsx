import * as Radix from '@radix-ui/react-popover'
import { IconButton } from './Button'
import { InfoIcon } from './icons'

// A box that floats over the note beside the button that opens it, and a tap anywhere else closes it.
// Focus stays where it was, so the keyboard stays up while typing.
export function Popover({
  side,
  open,
  onOpenChange,
  trigger,
  className = '',
  children,
}: {
  side: 'top' | 'bottom'
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactElement
  className?: string
  children: React.ReactNode
}) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          // Clears the padding and border of the bar the button sits in: the toolbar below, the header above.
          // The header's buttons sit at its right end, so its boxes line up with their button's right edge.
          side={side}
          sideOffset={side === 'top' ? 20 : 18}
          align={side === 'top' ? 'center' : 'end'}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={`flex items-center gap-2 border-2 border-border bg-surface p-1 ${className}`}
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}

// A section's details stay off the page until someone taps the icon beside its name.
export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>
        <IconButton label={label} className="-my-2.5 text-ink-muted">
          <InfoIcon className="size-4.5" />
        </IconButton>
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side="top"
          collisionPadding={8}
          className="max-w-72 border-2 border-border bg-surface p-3 text-sm"
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
