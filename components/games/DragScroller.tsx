'use client'

import { useRef } from 'react'

// A horizontally-scrollable row you can drag with the mouse (touch already
// scrolls natively). Swallows the click that ends a drag so it doesn't fire
// buttons/links inside the row.
export default function DragScroller({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false })

  function onMouseDown(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    drag.current = { down: true, startX: e.pageX, startLeft: el.scrollLeft, moved: false }
  }
  function onMouseMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el || !drag.current.down) return
    const dx = e.pageX - drag.current.startX
    if (Math.abs(dx) > 3) drag.current.moved = true
    el.scrollLeft = drag.current.startLeft - dx
  }
  function end() {
    drag.current.down = false
  }
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      drag.current.moved = false
    }
  }

  return (
    <div
      ref={ref}
      className={className}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={end}
      onMouseLeave={end}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  )
}
