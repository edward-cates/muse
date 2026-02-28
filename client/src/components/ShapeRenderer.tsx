import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react'
import type { ShapeElement, Tool } from '../types'

interface Props {
  shape: ShapeElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>>) => void
  onStartEdit: (id: string) => void
  editingId: string | null
  scale: number
  activeTool: Tool
}

const MIN_SIZE = 10

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: { dir: HandleDir; x: number; y: number; cursor: string }[] = [
  { dir: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { dir: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { dir: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { dir: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { dir: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { dir: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { dir: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { dir: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

function shapeSvg(type: ShapeElement['type'], w: number, h: number, fill: string, stroke: string, strokeWidth: number, isSelected: boolean) {
  const accentStroke = isSelected ? '#4f46e5' : stroke
  const sw = isSelected ? strokeWidth + 0.5 : strokeWidth
  switch (type) {
    case 'rectangle':
      return (
        <rect
          x={sw / 2}
          y={sw / 2}
          width={w - sw}
          height={h - sw}
          rx={3}
          fill={fill}
          stroke={accentStroke}
          strokeWidth={sw}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(0, (w - sw) / 2)}
          ry={Math.max(0, (h - sw) / 2)}
          fill={fill}
          stroke={accentStroke}
          strokeWidth={sw}
        />
      )
    case 'diamond': {
      const pts = `${w / 2},${sw / 2} ${w - sw / 2},${h / 2} ${w / 2},${h - sw / 2} ${sw / 2},${h / 2}`
      return <polygon points={pts} fill={fill} stroke={accentStroke} strokeWidth={sw} />
    }
  }
}

export function ShapeRenderer({ shape, isSelected, onSelect, onUpdate, onStartEdit, editingId, scale, activeTool }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isEditing = editingId === shape.id
  const showHandles = isSelected && activeTool === 'select'

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isEditing && (e.target as HTMLElement).tagName === 'TEXTAREA') return

      // In non-select modes, let the event propagate to Canvas for tool handling
      if (activeTool !== 'select') return

      e.stopPropagation()
      onSelect(shape.id, e.shiftKey)
      if (e.shiftKey) return // Don't start drag on shift-click
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      shapeStart.current = { x: shape.x, y: shape.y }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        onUpdate(shape.id, {
          x: shapeStart.current.x + dx,
          y: shapeStart.current.y + dy,
        })
      }

      const handleUp = () => {
        setIsDragging(false)
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [shape.id, shape.x, shape.y, scale, onSelect, onUpdate, isEditing, activeTool],
  )

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onStartEdit(shape.id)
    },
    [shape.id, onStartEdit],
  )

  const handleResizeStart = useCallback(
    (e: MouseEvent, dir: HandleDir) => {
      e.stopPropagation()
      e.preventDefault()
      const startMouse = { x: e.clientX, y: e.clientY }
      const startShape = { x: shape.x, y: shape.y, w: shape.width, h: shape.height }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - startMouse.x) / scale
        const dy = (ev.clientY - startMouse.y) / scale

        let { x, y, w, h } = startShape

        if (dir.includes('e')) w = Math.max(MIN_SIZE, startShape.w + dx)
        if (dir.includes('w')) {
          const newW = Math.max(MIN_SIZE, startShape.w - dx)
          x = startShape.x + startShape.w - newW
          w = newW
        }
        if (dir.includes('s')) h = Math.max(MIN_SIZE, startShape.h + dy)
        if (dir.includes('n')) {
          const newH = Math.max(MIN_SIZE, startShape.h - dy)
          y = startShape.y + startShape.h - newH
          h = newH
        }

        onUpdate(shape.id, { x, y, width: w, height: h })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [shape.id, shape.x, shape.y, shape.width, shape.height, scale, onUpdate],
  )

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus()
    }
  }, [isEditing])

  // Sync textarea with external text changes
  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = shape.text
    }
  }, [shape.text])

  return (
    <div
      data-testid={`shape-${shape.type}`}
      data-shape-id={shape.id}
      className={`shape ${isSelected ? 'shape--selected' : ''} ${isDragging ? 'shape--dragging' : ''}`}
      style={{
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        className="shape__outline"
        width={shape.width}
        height={shape.height}
        viewBox={`0 0 ${shape.width} ${shape.height}`}
      >
        {shapeSvg(shape.type, shape.width, shape.height, shape.fill, shape.stroke, shape.strokeWidth, isSelected)}
      </svg>
      <textarea
        ref={textRef}
        className={`shape__text ${isEditing ? 'shape__text--editing' : ''}`}
        defaultValue={shape.text}
        placeholder={isEditing ? 'Type here...' : ''}
        onChange={(e) => onUpdate(shape.id, { text: e.target.value })}
        onMouseDown={(e) => {
          if (isEditing) e.stopPropagation()
        }}
      />
      {showHandles && HANDLES.map(({ dir, x, y, cursor }) => (
        <div
          key={dir}
          data-handle={dir}
          className="resize-handle"
          style={{
            left: x * shape.width - 4,
            top: y * shape.height - 4,
            cursor,
          }}
          onMouseDown={(e) => handleResizeStart(e, dir)}
        />
      ))}
    </div>
  )
}
