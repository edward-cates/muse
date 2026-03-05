import { useRef, useCallback, type MouseEvent } from 'react'
import type { DocumentCardElement, Tool } from '../types'

interface Props {
  element: DocumentCardElement
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

const typeLabels: Record<string, string> = {
  canvas: 'Canvas',
  html_artifact: 'HTML Artifact',
}

const typeIcons: Record<string, React.ReactNode> = {
  canvas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
    </svg>
  ),
  html_artifact: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
}

export function DocumentCardRenderer({ element, isSelected, onSelect, onUpdate, scale, activeTool }: Props) {
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

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      window.location.hash = `#/d/${element.documentId}`
    },
    [element.documentId],
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

  return (
    <div
      data-testid="document-card-element"
      data-shape-id={element.id}
      className={`shape document-card ${isSelected ? 'shape--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="document-card__inner">
        <div className="document-card__icon">
          {typeIcons[element.documentType] || typeIcons.canvas}
        </div>
        <div className="document-card__title">{element.title || 'Untitled'}</div>
        <div className="document-card__type">{typeLabels[element.documentType] || element.documentType}</div>
        <div className="document-card__hint">Double-click to open</div>
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
