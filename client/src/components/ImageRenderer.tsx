import { useRef, useCallback, type MouseEvent } from 'react'
import type { ImageElement, Tool } from '../types'

interface Props {
  element: ImageElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  scale: number
  activeTool: Tool
}

const HANDLES: { dir: string; x: number; y: number; cursor: string }[] = [
  { dir: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { dir: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { dir: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { dir: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { dir: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { dir: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { dir: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { dir: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

export function ImageRenderer({ element, isSelected, onSelect, onUpdate, scale, activeTool }: Props) {
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (activeTool !== 'select') return
      e.stopPropagation()
      onSelect(element.id, e.shiftKey)
      if (e.shiftKey) return

      dragStart.current = { x: e.clientX, y: e.clientY }
      elStart.current = { x: element.x, y: element.y }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        onUpdate(element.id, { x: elStart.current.x + dx, y: elStart.current.y + dy })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [element.id, element.x, element.y, scale, onSelect, onUpdate, activeTool],
  )

  const handleResizeStart = useCallback(
    (e: MouseEvent, dir: string) => {
      e.stopPropagation()
      e.preventDefault()
      const startMouse = { x: e.clientX, y: e.clientY }
      const startEl = { x: element.x, y: element.y, w: element.width, h: element.height }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - startMouse.x) / scale
        const dy = (ev.clientY - startMouse.y) / scale
        let { x, y, w, h } = startEl

        if (dir.includes('e')) w = Math.max(10, startEl.w + dx)
        if (dir.includes('w')) { const newW = Math.max(10, startEl.w - dx); x = startEl.x + startEl.w - newW; w = newW }
        if (dir.includes('s')) h = Math.max(10, startEl.h + dy)
        if (dir.includes('n')) { const newH = Math.max(10, startEl.h - dy); y = startEl.y + startEl.h - newH; h = newH }

        onUpdate(element.id, { x, y, width: w, height: h })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [element.id, element.x, element.y, element.width, element.height, scale, onUpdate],
  )

  const showHandles = isSelected && activeTool === 'select'

  return (
    <div
      data-testid="image-element"
      data-shape-id={element.id}
      className={`shape image-element ${isSelected ? 'shape--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
    >
      <img
        src={element.src}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
      />
      {showHandles && HANDLES.map(({ dir, x, y, cursor }) => (
        <div
          key={dir}
          data-handle={dir}
          className="resize-handle"
          style={{
            left: x * element.width - 4,
            top: y * element.height - 4,
            cursor,
          }}
          onMouseDown={(e) => handleResizeStart(e, dir)}
        />
      ))}
    </div>
  )
}
