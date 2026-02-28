import { useRef, useCallback, type MouseEvent, type ReactNode } from 'react'
import type { FrameElement, Tool, CanvasElement, ShapeElement } from '../types'
import { isShape } from '../types'

interface Props {
  frame: FrameElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  scale: number
  activeTool: Tool
  elements: CanvasElement[]
  children?: ReactNode
}

export function FrameRenderer({ frame, isSelected, onSelect, onUpdate, scale, activeTool, elements, children }: Props) {
  const dragStart = useRef({ x: 0, y: 0 })
  const frameStart = useRef({ x: 0, y: 0 })

  // Find child shape IDs for moving with frame
  const childIds = useRef<{ id: string; x: number; y: number }[]>([])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (activeTool !== 'select') return
      e.stopPropagation()
      onSelect(frame.id, e.shiftKey)
      if (e.shiftKey) return

      dragStart.current = { x: e.clientX, y: e.clientY }
      frameStart.current = { x: frame.x, y: frame.y }

      // Capture children positions at drag start
      childIds.current = elements
        .filter(el => {
          if (el.id === frame.id) return false
          if (!isShape(el)) return false
          const s = el as ShapeElement
          return (
            s.x >= frame.x &&
            s.y >= frame.y &&
            s.x + s.width <= frame.x + frame.width &&
            s.y + s.height <= frame.y + frame.height
          )
        })
        .map(el => ({ id: el.id, x: (el as ShapeElement).x, y: (el as ShapeElement).y }))

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        onUpdate(frame.id, { x: frameStart.current.x + dx, y: frameStart.current.y + dy })
        // Move children too
        for (const child of childIds.current) {
          onUpdate(child.id, { x: child.x + dx, y: child.y + dy })
        }
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [frame.id, frame.x, frame.y, frame.width, frame.height, scale, onSelect, onUpdate, activeTool, elements],
  )

  return (
    <div
      data-testid="frame-element"
      data-shape-id={frame.id}
      className={`frame-element ${isSelected ? 'shape--selected' : ''}`}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height,
        overflow: 'hidden',
        opacity: (frame.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="frame-title">{frame.label}</div>
      {children}
    </div>
  )
}
