import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react'
import type { ShapeElement, ShapeType, Tool } from '../types'

interface Props {
  shape: ShapeElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>>) => void
  onStartEdit: (id: string) => void
  editingId: string | null
  scale: number
  activeTool: Tool
  gridEnabled?: boolean
  onClone?: (type: ShapeType, x: number, y: number, w: number, h: number) => string
  onDragMove?: (id: string, x: number, y: number) => void
  onDragEnd?: () => void
  groupSiblings?: { id: string; x: number; y: number }[]
}

const MIN_SIZE = 10
const GRID_SIZE = 20

function snap(v: number, gridEnabled: boolean): number {
  if (!gridEnabled) return v
  return Math.round(v / GRID_SIZE) * GRID_SIZE
}

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

function getStrokeDasharray(strokeStyle: string | undefined, strokeWidth: number): string | undefined {
  if (!strokeStyle || strokeStyle === 'solid') return undefined
  if (strokeStyle === 'dashed') return `${strokeWidth * 4} ${strokeWidth * 3}`
  if (strokeStyle === 'dotted') return `${strokeWidth} ${strokeWidth * 2}`
  return undefined
}

function shapeSvg(type: ShapeElement['type'], w: number, h: number, fill: string, stroke: string, strokeWidth: number, _isSelected: boolean, cornerRadius: number, strokeStyle?: string) {
  const sw = strokeWidth
  const dashArray = getStrokeDasharray(strokeStyle, sw)

  switch (type) {
    case 'rectangle':
      return (
        <rect
          x={sw / 2} y={sw / 2}
          width={w - sw} height={h - sw}
          rx={cornerRadius}
          fill={fill === 'none' ? 'transparent' : fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dashArray}
        />
      )
    case 'ellipse':
      return (
        <ellipse
          cx={w / 2} cy={h / 2}
          rx={Math.max(0, (w - sw) / 2)}
          ry={Math.max(0, (h - sw) / 2)}
          fill={fill === 'none' ? 'transparent' : fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dashArray}
        />
      )
    case 'diamond': {
      const pts = `${w / 2},${sw / 2} ${w - sw / 2},${h / 2} ${w / 2},${h - sw / 2} ${sw / 2},${h / 2}`
      return <polygon points={pts} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashArray} />
    }
    case 'triangle': {
      const pts = `${w / 2},${sw / 2} ${w - sw / 2},${h - sw / 2} ${sw / 2},${h - sw / 2}`
      return <polygon points={pts} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashArray} />
    }
    case 'hexagon': {
      const cx = w / 2, cy = h / 2
      const rx = (w - sw) / 2, ry = (h - sw) / 2
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        return `${cx + rx * Math.cos(angle)},${cy + ry * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashArray} />
    }
    case 'star': {
      const cx = w / 2, cy = h / 2
      const outerR = Math.min(w, h) / 2 - sw
      const innerR = outerR * 0.4
      const pts = Array.from({ length: 10 }, (_, i) => {
        const angle = (Math.PI / 5) * i - Math.PI / 2
        const r = i % 2 === 0 ? outerR : innerR
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashArray} />
    }
    case 'cloud': {
      const path = `M ${w * 0.25} ${h * 0.7}
        C ${w * 0.05} ${h * 0.7}, ${w * 0.05} ${h * 0.4}, ${w * 0.2} ${h * 0.35}
        C ${w * 0.15} ${h * 0.1}, ${w * 0.45} ${h * 0.05}, ${w * 0.5} ${h * 0.25}
        C ${w * 0.55} ${h * 0.05}, ${w * 0.85} ${h * 0.1}, ${w * 0.8} ${h * 0.35}
        C ${w * 0.95} ${h * 0.4}, ${w * 0.95} ${h * 0.7}, ${w * 0.75} ${h * 0.7}
        Z`
      return <path d={path} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashArray} />
    }
  }
}

export function ShapeRenderer({ shape, isSelected, onSelect, onUpdate, onStartEdit, editingId, scale, activeTool, gridEnabled = false, onClone, onDragMove, onDragEnd, groupSiblings }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const textRef = useRef<HTMLTextAreaElement>(null)
  const isEditing = editingId === shape.id
  const showHandles = isSelected && activeTool === 'select' && !shape.locked
  const showRotationHandle = isSelected && activeTool === 'select' && !shape.locked

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isEditing && (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (activeTool === 'hand') {
        e.stopPropagation()
        onSelect(shape.id, e.shiftKey)
        return
      }
      if (activeTool !== 'select') return

      e.stopPropagation()
      onSelect(shape.id, e.shiftKey)
      if (e.shiftKey) return
      if (shape.locked) return

      // Alt+drag = clone
      if (e.altKey && onClone) {
        const cloneId = onClone(shape.type, shape.x + 20, shape.y + 20, shape.width, shape.height)
        onSelect(cloneId)
        // Start dragging the clone
        dragStart.current = { x: e.clientX, y: e.clientY }
        shapeStart.current = { x: shape.x + 20, y: shape.y + 20 }
        setIsDragging(true)

        const handleMove = (ev: globalThis.MouseEvent) => {
          const dx = (ev.clientX - dragStart.current.x) / scale
          const dy = (ev.clientY - dragStart.current.y) / scale
          const newX = snap(shapeStart.current.x + dx, gridEnabled)
          const newY = snap(shapeStart.current.y + dy, gridEnabled)
          onUpdate(cloneId, { x: newX, y: newY })
        }

        const handleUp = () => {
          setIsDragging(false)
          window.removeEventListener('mousemove', handleMove)
          window.removeEventListener('mouseup', handleUp)
        }

        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
        return
      }

      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      shapeStart.current = { x: shape.x, y: shape.y }
      // Capture group siblings' start positions
      const siblingStarts = groupSiblings ? groupSiblings.map(s => ({ id: s.id, x: s.x, y: s.y })) : []

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        const newX = snap(shapeStart.current.x + dx, gridEnabled)
        const newY = snap(shapeStart.current.y + dy, gridEnabled)
        onUpdate(shape.id, { x: newX, y: newY })
        onDragMove?.(shape.id, newX, newY)
        // Move group siblings by same delta
        const actualDx = newX - shapeStart.current.x
        const actualDy = newY - shapeStart.current.y
        for (const sib of siblingStarts) {
          onUpdate(sib.id, { x: sib.x + actualDx, y: sib.y + actualDy })
        }
      }

      const handleUp = () => {
        setIsDragging(false)
        onDragEnd?.()
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [shape.id, shape.x, shape.y, shape.width, shape.height, shape.type, shape.locked, scale, onSelect, onUpdate, isEditing, activeTool, gridEnabled, onClone, onDragMove, onDragEnd, groupSiblings],
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
      const aspectRatio = startShape.w / startShape.h

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

        // Shift = constrain aspect ratio
        if (ev.shiftKey) {
          if (dir === 'e' || dir === 'w') {
            h = w / aspectRatio
          } else if (dir === 'n' || dir === 's') {
            w = h * aspectRatio
          } else {
            // Corner handle: use the larger dimension
            const newAR = w / h
            if (newAR > aspectRatio) {
              w = h * aspectRatio
            } else {
              h = w / aspectRatio
            }
          }
        }

        // Alt = resize from center
        if (ev.altKey) {
          const cx = startShape.x + startShape.w / 2
          const cy = startShape.y + startShape.h / 2
          x = cx - w / 2
          y = cy - h / 2
        }

        // Snap to grid
        x = snap(x, gridEnabled)
        y = snap(y, gridEnabled)
        w = snap(w, gridEnabled) || w
        h = snap(h, gridEnabled) || h

        onUpdate(shape.id, { x, y, width: w, height: h })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [shape.id, shape.x, shape.y, shape.width, shape.height, scale, onUpdate, gridEnabled],
  )

  // Rotation handle
  const handleRotationStart = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const centerX = shape.x + shape.width / 2
      const centerY = shape.y + shape.height / 2

      const handleMove = (ev: globalThis.MouseEvent) => {
        const world = {
          x: (ev.clientX - 0) / scale, // approximate — using offset would be better
          y: (ev.clientY - 0) / scale,
        }
        // Use screen coords relative to shape center on screen
        const shapeCenterScreenX = shape.x * scale + shape.width * scale / 2
        const shapeCenterScreenY = shape.y * scale + shape.height * scale / 2
        const dx = ev.clientX - shapeCenterScreenX
        const dy = ev.clientY - shapeCenterScreenY
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90 // +90 because handle is above shape

        if (ev.shiftKey) {
          angle = Math.round(angle / 15) * 15
        }

        // Normalize to 0-360
        angle = ((angle % 360) + 360) % 360

        onUpdate(shape.id, { rotation: Math.round(angle) })
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

  // Auto-size textarea to content so flex vertical alignment works on the actual text
  const autoResize = useCallback(() => {
    const ta = textRef.current
    if (!ta) return
    ta.style.height = '0'
    ta.style.height = `${ta.scrollHeight}px`
  }, [])

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus()
      autoResize()
    }
  }, [isEditing, autoResize])

  // Sync textarea with external text changes
  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = shape.text
    }
    autoResize()
  }, [shape.text, autoResize])

  // Re-measure on font changes
  useEffect(() => {
    autoResize()
  }, [shape.fontSize, shape.fontFamily, shape.width, autoResize])

  // Build transform string
  const transforms: string[] = []
  if (shape.rotation) transforms.push(`rotate(${shape.rotation}deg)`)
  if (shape.flipH) transforms.push('scaleX(-1)')
  if (shape.flipV) transforms.push('scaleY(-1)')
  const transformStr = transforms.length > 0 ? transforms.join(' ') : undefined

  // Vertical align mapping
  const vAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }

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
        transform: transformStr,
        opacity: (shape.opacity ?? 100) / 100,
        filter: shape.shadow ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.08)) drop-shadow(0 2px 8px rgba(0,0,0,0.06))' : undefined,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <svg
        className="shape__outline"
        width={shape.width}
        height={shape.height}
        viewBox={`0 0 ${shape.width} ${shape.height}`}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {shapeSvg(shape.type, shape.width, shape.height, shape.fill, shape.stroke, shape.strokeWidth, isSelected, shape.cornerRadius ?? 8, shape.strokeStyle)}
      </svg>
      <div className="shape__text-container" style={{ justifyContent: vAlignMap[shape.verticalAlign || 'middle'] || 'center' }}>
        <textarea
          ref={textRef}
          className={`shape__text ${isEditing ? 'shape__text--editing' : ''}`}
          defaultValue={shape.text}
          placeholder={isEditing ? 'Type here...' : ''}
          style={{
            fontFamily: shape.fontFamily || 'sans-serif',
            fontSize: shape.fontSize ? `${shape.fontSize}px` : '14px',
            textAlign: shape.textAlign || 'center',
          }}
          onChange={(e) => { onUpdate(shape.id, { text: e.target.value }); autoResize() }}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation()
          }}
        />
      </div>
      {shape.locked && (
        <div className="lock-indicator" title="Locked">🔒</div>
      )}
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
      {showRotationHandle && (
        <>
          <div className="rotation-line" />
          <div
            className="rotation-handle"
            onMouseDown={handleRotationStart}
          />
        </>
      )}
    </div>
  )
}
