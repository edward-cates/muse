import { useRef, useCallback, type MouseEvent } from 'react'
import type { DecompositionCardElement, Tool } from '../types'
import './DecompositionCardRenderer.css'

interface Props {
  element: DecompositionCardElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onShowSource?: (documentId: string, lineRanges: Array<{start: number; end: number}>) => void
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

export function DecompositionCardRenderer({ element, isSelected, onSelect, onUpdate, onShowSource, scale, activeTool }: Props) {
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })

  // Parse lineRanges from flat array to objects
  const lineRangeObjects: Array<{start: number; end: number}> = []
  for (let i = 0; i < element.lineRanges.length; i += 2) {
    lineRangeObjects.push({ start: element.lineRanges[i], end: element.lineRanges[i + 1] })
  }

  const handleMouseDown = useCallback((e: MouseEvent) => {
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
  }, [element.id, element.x, element.y, activeTool, scale, onSelect, onUpdate])

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
        const MIN_W = 200, MIN_H = 120

        if (dir.includes('e')) w = Math.max(MIN_W, startEl.w + dx)
        if (dir.includes('w')) { const newW = Math.max(MIN_W, startEl.w - dx); x = startEl.x + startEl.w - newW; w = newW }
        if (dir.includes('s')) h = Math.max(MIN_H, startEl.h + dy)
        if (dir.includes('n')) { const newH = Math.max(MIN_H, startEl.h - dy); y = startEl.y + startEl.h - newH; h = newH }

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

  const handleRefClick = useCallback((start: number, end: number, e: MouseEvent) => {
    e.stopPropagation()
    onShowSource?.(element.documentId, [{ start, end }])
  }, [element.documentId, onShowSource])

  const showHandles = isSelected && activeTool === 'select'

  return (
    <div
      className={`shape decomposition-card ${isSelected ? 'shape--selected' : ''}`}
      data-testid="decomposition-card"
      data-shape-id={element.id}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: element.opacity / 100,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="decomposition-card__header">
        <span className="decomposition-card__dot" style={{ background: element.color }} />
        <span className="decomposition-card__topic">{element.topic}</span>
      </div>
      <div className="decomposition-card__summary">{element.summary}</div>
      <div className="decomposition-card__refs">
        {lineRangeObjects.map((r, i) => (
          <button
            key={i}
            className="decomposition-card__ref"
            data-testid="source-ref"
            onClick={(e) => handleRefClick(r.start, r.end, e)}
          >
            lines {r.start}-{r.end}
          </button>
        ))}
      </div>
      {showHandles && HANDLES.map(({ dir, x, y, cursor }) => (
        <div
          key={dir}
          className="resize-handle"
          data-handle={dir}
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
