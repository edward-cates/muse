import { useRef, useCallback, type MouseEvent } from 'react'
import type { WebCardElement, Tool } from '../types'

interface Props {
  element: WebCardElement
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

function faviconUrl(pageUrl: string): string {
  try {
    const u = new URL(pageUrl)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`
  } catch {
    return ''
  }
}

export function WebCardRenderer({ element, isSelected, onSelect, onUpdate, scale, activeTool }: Props) {
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (activeTool === 'hand') {
        e.stopPropagation()
        onSelect(element.id, e.shiftKey)
        return
      }
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

        if (dir.includes('e')) w = Math.max(200, startEl.w + dx)
        if (dir.includes('w')) { const newW = Math.max(200, startEl.w - dx); x = startEl.x + startEl.w - newW; w = newW }
        if (dir.includes('s')) h = Math.max(120, startEl.h + dy)
        if (dir.includes('n')) { const newH = Math.max(120, startEl.h - dy); y = startEl.y + startEl.h - newH; h = newH }

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
  const favicon = element.faviconUrl || faviconUrl(element.url)

  return (
    <div
      data-testid="webcard-element"
      data-shape-id={element.id}
      className={`shape webcard-element ${isSelected ? 'shape--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="webcard__inner">
        <div className="webcard__header">
          {favicon && <img src={favicon} alt="" className="webcard__favicon" />}
          <span className="webcard__title">{element.title || 'Untitled'}</span>
        </div>
        <a className="webcard__url" href={element.url} target="_blank" rel="noopener noreferrer"
           onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {element.url}
        </a>
        <div className="webcard__snippet">{element.snippet}</div>
      </div>
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
