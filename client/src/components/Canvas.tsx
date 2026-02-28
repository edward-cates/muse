import { useRef, useState, useCallback, useEffect, type MouseEvent, type WheelEvent } from 'react'
import { useCursors } from '../hooks/useCursors'
import { useCollab } from '../collab/CollabContext'
import { ShapeRenderer } from './ShapeRenderer'
import { PathLayer } from './PathLayer'
import { LineLayer, getAnchorPoint, findClosestAnchors } from './LineLayer'
import { Cursors } from './Cursors'
import { isShape, isPath, isLine } from '../types'
import type { Tool, ShapeType, CanvasElement, Anchor, ShapeElement, PathElement, LineElement } from '../types'

interface Props {
  activeTool: Tool
  selectedId: string | null
  onSelectedIdChange: (id: string | null) => void
  onToolChange: (tool: Tool) => void
  onShapeCreated: () => void
  elements: CanvasElement[]
  addShape: (type: ShapeType, x: number, y: number, w: number, h: number) => string
  addPath: (x: number, y: number, points: number[], stroke: string, strokeWidth: number) => string
  addLine: (startShapeId: string, endShapeId: string, startAnchor: Anchor, endAnchor: Anchor) => string
  updateElement: (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>> | Partial<Omit<PathElement, 'id' | 'type'>> | Partial<Omit<LineElement, 'id' | 'type'>>) => void
  deleteElement: (id: string) => void
}

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond']
const MIN_SHAPE_SIZE = 10

export function Canvas({ activeTool, selectedId, onSelectedIdChange, onToolChange, onShapeCreated, elements, addShape, addPath, addLine, updateElement, deleteElement }: Props) {
  const { awareness } = useCollab()
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

  // Line tool state
  const [lineStart, setLineStart] = useState<{ shapeId: string; anchor: Anchor } | null>(null)
  const [linePreviewEnd, setLinePreviewEnd] = useState<{ x: number; y: number } | null>(null)
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null)

  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const isCreatingShape = useRef(false)
  const isDrawing = useRef(false)
  const isPanningRef = useRef(false)
  const lastDrawPoint = useRef({ x: 0, y: 0 })
  const drawingPointsRef = useRef<number[]>([])
  const shapesRef = useRef<ShapeElement[]>([])

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - offset.x) / scale,
      y: (sy - offset.y) / scale,
    }),
    [offset, scale],
  )

  // Keep shapesRef current
  const shapes = elements.filter(isShape)
  const paths = elements.filter(isPath)
  const lines = elements.filter(isLine)
  shapesRef.current = shapes

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

  function hitTestShape(world: { x: number; y: number }): ShapeElement | undefined {
    return shapesRef.current.find(
      (s) => world.x >= s.x && world.x <= s.x + s.width && world.y >= s.y && world.y <= s.y + s.height,
    )
  }

  function closestAnchor(shape: ShapeElement, world: { x: number; y: number }): Anchor {
    const anchors: Anchor[] = ['top', 'right', 'bottom', 'left']
    let best: Anchor = 'top'
    let bestDist = Infinity
    for (const a of anchors) {
      const pt = getAnchorPoint(shape, a)
      const dx = world.x - pt.x
      const dy = world.y - pt.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = a
      }
    }
    return best
  }

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
        isDrawing.current = true
        lastDrawPoint.current = { x: world.x, y: world.y }
        const initialPoints = [world.x, world.y]
        drawingPointsRef.current = initialPoints
        setDrawingPath({
          points: initialPoints,
          stroke: '#4f46e5',
          strokeWidth: 2,
        })
        return
      }

      if (activeTool === 'line') {
        const hitShape = hitTestShape(world)
        if (hitShape) {
          const anchor = closestAnchor(hitShape, world)
          setLineStart({ shapeId: hitShape.id, anchor })
          setLinePreviewEnd({ x: world.x, y: world.y })
        }
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
        const dx = world.x - lastDrawPoint.current.x
        const dy = world.y - lastDrawPoint.current.y
        if (dx * dx + dy * dy >= 9) {
          lastDrawPoint.current = { x: world.x, y: world.y }
          drawingPointsRef.current = [...drawingPointsRef.current, world.x, world.y]
          setDrawingPath((prev) => {
            if (!prev) return null
            return { ...prev, points: drawingPointsRef.current }
          })
        }
        return
      }

      // Line tool hover detection
      if (activeTool === 'line') {
        const hitShape = hitTestShape(world)
        setHoveredShapeId(hitShape ? hitShape.id : null)
        if (lineStart) {
          setLinePreviewEnd({ x: world.x, y: world.y })
        }
        return
      }
    },
    [screenToWorld, activeTool, lineStart],
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
          onShapeCreated()
        }
        setShapePreview(null)
        return
      }

      if (isDrawing.current) {
        isDrawing.current = false
        const pts = drawingPointsRef.current
        if (pts.length >= 4) {
          let minX = pts[0], minY = pts[1]
          for (let i = 2; i < pts.length; i += 2) {
            if (pts[i] < minX) minX = pts[i]
            if (pts[i + 1] < minY) minY = pts[i + 1]
          }
          addPath(minX, minY, pts, '#4f46e5', 2)
        }
        drawingPointsRef.current = []
        setDrawingPath(null)
        return
      }

      if (lineStart) {
        const world = screenToWorld(e.clientX, e.clientY)
        const hitShape = hitTestShape(world)
        if (hitShape && hitShape.id !== lineStart.shapeId) {
          const startShape = shapesRef.current.find((s) => s.id === lineStart.shapeId)
          if (startShape) {
            const { startAnchor, endAnchor } = findClosestAnchors(startShape, hitShape)
            addLine(startShape.id, hitShape.id, startAnchor, endAnchor)
          }
        }
        setLineStart(null)
        setLinePreviewEnd(null)
        return
      }
    },
    [shapePreview, addShape, addPath, addLine, onSelectedIdChange, onShapeCreated, lineStart, screenToWorld],
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

  // Cursor class
  let cursorClass = 'canvas--tool-select'
  if (isPanning) cursorClass = 'canvas--panning'
  else if (spaceHeld) cursorClass = 'canvas--space-held'
  else if (activeTool === 'draw') cursorClass = 'canvas--tool-draw'
  else if (activeTool === 'line') cursorClass = 'canvas--tool-line'
  else if (SHAPE_TOOLS.includes(activeTool)) cursorClass = 'canvas--tool-shape'

  // Shape preview SVG
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

  // Connection dots on hovered shape (line tool)
  const connectionDots = activeTool === 'line' && hoveredShapeId ? (() => {
    const s = shapes.find((sh) => sh.id === hoveredShapeId)
    if (!s) return null
    const anchors: Anchor[] = ['top', 'right', 'bottom', 'left']
    return anchors.map((anchor) => {
      const pt = getAnchorPoint(s, anchor)
      return (
        <div
          key={`${s.id}-${anchor}`}
          className="connection-dot"
          style={{ left: pt.x - 5, top: pt.y - 5 }}
        />
      )
    })
  })() : null

  // Line preview data for LineLayer
  const linePreviewData = lineStart && linePreviewEnd
    ? { startShapeId: lineStart.shapeId, startAnchor: lineStart.anchor, endX: linePreviewEnd.x, endY: linePreviewEnd.y }
    : null

  return (
    <div
      data-testid="canvas"
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
        <LineLayer
          shapes={shapes}
          lines={lines}
          selectedId={selectedId}
          onSelect={handleSelect}
          linePreview={linePreviewData}
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
            activeTool={activeTool}
          />
        ))}
        {previewSvg}
        {connectionDots}
        <Cursors cursors={cursors} />
      </div>
    </div>
  )
}
