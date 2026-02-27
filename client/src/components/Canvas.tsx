import { useRef, useState, useCallback, useEffect, type MouseEvent, type WheelEvent } from 'react'
import { useElements } from '../hooks/useElements'
import { useCursors } from '../hooks/useCursors'
import { awareness } from '../collab/provider'
import { ShapeRenderer } from './ShapeRenderer'
import { PathLayer } from './PathLayer'
import { Cursors } from './Cursors'
import { isShape, isPath } from '../types'
import type { Tool, ShapeType } from '../types'

interface Props {
  activeTool: Tool
  selectedId: string | null
  onSelectedIdChange: (id: string | null) => void
  onToolChange: (tool: Tool) => void
  onShapeCreated: () => void
}

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond']
const MIN_SHAPE_SIZE = 10

export function Canvas({ activeTool, selectedId, onSelectedIdChange, onToolChange, onShapeCreated }: Props) {
  const { elements, addShape, addPath, updateElement, deleteElement } = useElements()
  const cursors = useCursors()

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Shape creation preview
  const [shapePreview, setShapePreview] = useState<{
    type: ShapeType
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  // Drawing state
  const [drawingPath, setDrawingPath] = useState<{
    points: number[]
    stroke: string
    strokeWidth: number
  } | null>(null)

  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const isCreatingShape = useRef(false)
  const isDrawing = useRef(false)
  const isPanningRef = useRef(false)
  const lastDrawPoint = useRef({ x: 0, y: 0 })

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - offset.x) / scale,
      y: (sy - offset.y) / scale,
    }),
    [offset, scale],
  )

  // Space key for pan-anywhere
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('textarea, input')) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Delete/Backspace removes selected element
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('textarea, input')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId)
        onSelectedIdChange(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, deleteElement, onSelectedIdChange])

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      setIsPanning(true)
      isPanningRef.current = true
      panStart.current = { x: clientX, y: clientY }
      offsetStart.current = { ...offset }
    },
    [offset],
  )

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY)

      // Middle-click or space+click = pan
      if (e.button === 1 || spaceHeld) {
        startPan(e.clientX, e.clientY)
        return
      }

      // Only process left clicks below
      if (e.button !== 0) return

      if (activeTool === 'select') {
        // Click on empty canvas = deselect + pan
        if (e.target === e.currentTarget) {
          onSelectedIdChange(null)
          setEditingId(null)
          startPan(e.clientX, e.clientY)
        }
        return
      }

      if (SHAPE_TOOLS.includes(activeTool)) {
        // Start shape creation
        isCreatingShape.current = true
        shapeStart.current = { x: world.x, y: world.y }
        setShapePreview({
          type: activeTool as ShapeType,
          x: world.x,
          y: world.y,
          w: 0,
          h: 0,
        })
        return
      }

      if (activeTool === 'draw') {
        // Start freehand drawing
        isDrawing.current = true
        lastDrawPoint.current = { x: world.x, y: world.y }
        setDrawingPath({
          points: [world.x, world.y],
          stroke: '#1e1e1e',
          strokeWidth: 2,
        })
        return
      }
    },
    [activeTool, screenToWorld, spaceHeld, startPan, onSelectedIdChange],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY)
      awareness.setLocalStateField('cursor', world)

      if (isPanningRef.current) {
        const dx = e.clientX - panStart.current.x
        const dy = e.clientY - panStart.current.y
        setOffset({
          x: offsetStart.current.x + dx,
          y: offsetStart.current.y + dy,
        })
        return
      }

      if (isCreatingShape.current) {
        const sx = shapeStart.current.x
        const sy = shapeStart.current.y
        const x = Math.min(sx, world.x)
        const y = Math.min(sy, world.y)
        const w = Math.abs(world.x - sx)
        const h = Math.abs(world.y - sy)
        setShapePreview((prev) => (prev ? { ...prev, x, y, w, h } : null))
        return
      }

      if (isDrawing.current) {
        // Sample only if moved enough (~3px)
        const dx = world.x - lastDrawPoint.current.x
        const dy = world.y - lastDrawPoint.current.y
        if (dx * dx + dy * dy >= 9) {
          lastDrawPoint.current = { x: world.x, y: world.y }
          setDrawingPath((prev) => {
            if (!prev) return null
            return { ...prev, points: [...prev.points, world.x, world.y] }
          })
        }
        return
      }
    },
    [screenToWorld],
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (isPanningRef.current) {
        setIsPanning(false)
        isPanningRef.current = false
        return
      }

      if (isCreatingShape.current) {
        isCreatingShape.current = false
        if (shapePreview && shapePreview.w >= MIN_SHAPE_SIZE && shapePreview.h >= MIN_SHAPE_SIZE) {
          const id = addShape(shapePreview.type, shapePreview.x, shapePreview.y, shapePreview.w, shapePreview.h)
          onSelectedIdChange(id)
          onShapeCreated() // switches to select tool
        }
        setShapePreview(null)
        return
      }

      if (isDrawing.current) {
        isDrawing.current = false
        if (drawingPath && drawingPath.points.length >= 4) {
          // Compute bounding box for origin
          const pts = drawingPath.points
          let minX = pts[0], minY = pts[1]
          for (let i = 2; i < pts.length; i += 2) {
            if (pts[i] < minX) minX = pts[i]
            if (pts[i + 1] < minY) minY = pts[i + 1]
          }
          addPath(minX, minY, pts, drawingPath.stroke, drawingPath.strokeWidth)
        }
        setDrawingPath(null)
        return
      }
    },
    [shapePreview, drawingPath, addShape, addPath, onSelectedIdChange, onShapeCreated],
  )

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const newScale = Math.min(Math.max(scale * factor, 0.1), 5)
      const cx = e.clientX
      const cy = e.clientY
      setOffset((prev) => ({
        x: cx - (cx - prev.x) * (newScale / scale),
        y: cy - (cy - prev.y) * (newScale / scale),
      }))
      setScale(newScale)
    },
    [scale],
  )

  const handleSelect = useCallback(
    (id: string) => {
      if (activeTool === 'select') {
        onSelectedIdChange(id)
      }
    },
    [activeTool, onSelectedIdChange],
  )

  const handleStartEdit = useCallback(
    (id: string) => {
      if (activeTool === 'select') {
        setEditingId(id)
        onSelectedIdChange(id)
      }
    },
    [activeTool, onSelectedIdChange],
  )

  // Clear editing when selection changes away
  useEffect(() => {
    if (editingId && editingId !== selectedId) {
      setEditingId(null)
    }
  }, [selectedId, editingId])

  const shapes = elements.filter(isShape)
  const paths = elements.filter(isPath)

  // Cursor class
  let cursorClass = 'canvas--tool-select'
  if (isPanning) cursorClass = 'canvas--panning'
  else if (spaceHeld) cursorClass = 'canvas--space-held'
  else if (activeTool === 'draw') cursorClass = 'canvas--tool-draw'
  else if (SHAPE_TOOLS.includes(activeTool)) cursorClass = 'canvas--tool-shape'

  // Preview SVG for shape being created
  const previewSvg = shapePreview && shapePreview.w > 0 && shapePreview.h > 0 ? (
    <div
      className="shape-preview"
      style={{
        left: shapePreview.x,
        top: shapePreview.y,
        width: shapePreview.w,
        height: shapePreview.h,
        position: 'absolute',
      }}
    >
      <svg width={shapePreview.w} height={shapePreview.h} viewBox={`0 0 ${shapePreview.w} ${shapePreview.h}`}>
        {shapePreview.type === 'rectangle' && (
          <rect x={1} y={1} width={shapePreview.w - 2} height={shapePreview.h - 2} rx={3} fill="none" stroke="#4f46e5" strokeWidth={1.5} strokeDasharray="6 3" />
        )}
        {shapePreview.type === 'ellipse' && (
          <ellipse cx={shapePreview.w / 2} cy={shapePreview.h / 2} rx={(shapePreview.w - 2) / 2} ry={(shapePreview.h - 2) / 2} fill="none" stroke="#4f46e5" strokeWidth={1.5} strokeDasharray="6 3" />
        )}
        {shapePreview.type === 'diamond' && (
          <polygon points={`${shapePreview.w / 2},1 ${shapePreview.w - 1},${shapePreview.h / 2} ${shapePreview.w / 2},${shapePreview.h - 1} 1,${shapePreview.h / 2}`} fill="none" stroke="#4f46e5" strokeWidth={1.5} strokeDasharray="6 3" />
        )}
      </svg>
    </div>
  ) : null

  return (
    <div
      className={`canvas ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        className="canvas__world"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <PathLayer
          paths={paths}
          selectedId={selectedId}
          onSelect={handleSelect}
          drawingPath={drawingPath}
        />
        {shapes.map((shape) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            isSelected={selectedId === shape.id}
            onSelect={handleSelect}
            onUpdate={updateElement}
            onStartEdit={handleStartEdit}
            editingId={editingId}
            scale={scale}
          />
        ))}
        {previewSvg}
        <Cursors cursors={cursors} />
      </div>
    </div>
  )
}
