import * as Radix from '@radix-ui/react-popover'

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
          className={`flex items-center gap-2 border-2 border-border bg-surface p-1 shadow-brutal ${className}`}
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}
