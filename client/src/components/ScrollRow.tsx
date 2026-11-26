import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

// The width of the chevrons, w-6.
const CHEVRON = 24

// A row that scrolls sideways under a wheel, with no scrollbar, since one would cover what it holds or make it
// taller. A chevron shows at each end with more past it, since a row can end exactly on a whole item. It goes once
// less than its width is left, so the item under it slides out instead of popping in.
export function ScrollRow({
  name,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { name: string }) {
  const row = useRef<HTMLDivElement>(null)
  const [moreLeft, setMoreLeft] = useState(false)
  const [moreRight, setMoreRight] = useState(false)
  const measure = () => {
    const el = row.current!
    setMoreLeft(el.scrollLeft > CHEVRON)
    setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > CHEVRON)
  }
  useLayoutEffect(measure)
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    observer.observe(row.current!)
    return () => observer.disconnect()
  }, [])
  // A smooth scroll restarts from where the last one got to, so a quick wheel notch adds to where it was headed.
  const glide = useRef({ to: 0, at: 0 })
  const scroll = (by: number) => {
    const el = row.current!
    const at = performance.now()
    const from = at - glide.current.at < 500 ? glide.current.to : el.scrollLeft
    glide.current = { to: Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + by)), at }
    el.scrollTo({ left: glide.current.to, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {moreLeft && (
        <button
          type="button"
          aria-label={`Scroll ${name} left`}
          title={`Scroll ${name} left`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => scroll(-row.current!.clientWidth / 2)}
          className="absolute inset-y-0 left-0 z-10 flex w-6 items-center justify-center border-r-2 border-border bg-surface"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      )}
      {moreRight && (
        <button
          type="button"
          aria-label={`Scroll ${name} right`}
          title={`Scroll ${name} right`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => scroll(row.current!.clientWidth / 2)}
          className="absolute inset-y-0 right-0 z-10 flex w-6 items-center justify-center border-l-2 border-border bg-surface"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}
      <div
        {...props}
        ref={row}
        onScroll={measure}
        onWheel={(e) => Math.abs(e.deltaY) > Math.abs(e.deltaX) && scroll(e.deltaY)}
        className={`flex overflow-x-auto [scrollbar-width:none] ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
