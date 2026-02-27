import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react'
import type { ShapeElement } from '../types'

interface Props {
  shape: ShapeElement
  isSelected: boolean
  onSelect: (id: string) => void
  onUpdate: (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>>) => void
  onStartEdit: (id: string) => void
  editingId: string | null
  scale: number
}

function shapeSvg(type: ShapeElement['type'], w: number, h: number, stroke: string, isSelected: boolean) {
  const accentStroke = isSelected ? '#4f46e5' : stroke
  const sw = isSelected ? 2 : 1.5
  switch (type) {
    case 'rectangle':
      return (
        <rect
          x={sw / 2}
          y={sw / 2}
          width={w - sw}
          height={h - sw}
          rx={3}
          fill="none"
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
          fill="none"
          stroke={accentStroke}
          strokeWidth={sw}
        />
      )
    case 'diamond': {
      const pts = `${w / 2},${sw / 2} ${w - sw / 2},${h / 2} ${w / 2},${h - sw / 2} ${sw / 2},${h / 2}`
      return <polygon points={pts} fill="none" stroke={accentStroke} strokeWidth={sw} />
    }
  }
}

export function ShapeRenderer({ shape, isSelected, onSelect, onUpdate, onStartEdit, editingId, scale }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isEditing = editingId === shape.id

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isEditing && (e.target as HTMLElement).tagName === 'TEXTAREA') return

      e.stopPropagation()
      onSelect(shape.id)
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
    [shape.id, shape.x, shape.y, scale, onSelect, onUpdate, isEditing],
  )

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onStartEdit(shape.id)
    },
    [shape.id, onStartEdit],
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
        {shapeSvg(shape.type, shape.width, shape.height, shape.stroke, isSelected)}
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
    </div>
  )
}
