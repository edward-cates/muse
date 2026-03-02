import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, type MouseEvent, type Ref } from 'react'
import { useCursors } from '../hooks/useCursors'
import { useCollab } from '../collab/CollabContext'
import { ShapeRenderer } from './ShapeRenderer'
import { TextRenderer } from './TextRenderer'
import { ImageRenderer } from './ImageRenderer'
import { FrameRenderer } from './FrameRenderer'
import { WebCardRenderer } from './WebCardRenderer'
import { PathLayer } from './PathLayer'
import { LineLayer, edgeIntersection } from './LineLayer'
import { Cursors } from './Cursors'
import { PropertyPanel } from './PropertyPanel'
import { AlignmentToolbar } from './AlignmentToolbar'
import { Minimap } from './Minimap'
import { isShape, isPath, isLine, isText, isImage, isFrame, isWebCard } from '../types'
import type { Tool, ShapeType, CanvasElement, LineType, ShapeElement, PathElement, LineElement, TextElement, ImageElement, FrameElement, WebCardElement } from '../types'

interface Props {
  activeTool: Tool
  activeLineType: LineType
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  onToolChange: (tool: Tool) => void
  onShapeCreated: () => void
  elements: CanvasElement[]
  addShape: (type: ShapeType, x: number, y: number, w: number, h: number) => string
  addPath: (x: number, y: number, points: number[], stroke: string, strokeWidth: number) => string
  addLine: (startShapeId: string, endShapeId: string, lineType?: LineType) => string
  addArrow: (startShapeId: string, endShapeId: string, startX: number, startY: number, endX: number, endY: number, lineType?: LineType) => string
  addText: (x: number, y: number) => string
  addImage: (x: number, y: number, w: number, h: number, src: string) => string
  addFrame: (x: number, y: number, w: number, h: number) => string
  updateElement: (id: string, updates: Record<string, unknown>) => void
  deleteElement: (id: string) => void
  gridEnabled: boolean
  darkMode: boolean
  minimapVisible: boolean
  setLastUsedStyle: (fill: string, stroke: string) => void
  groupElements: (ids: string[]) => string
  ungroupElements: (groupId: string) => void
  stopCapturing: () => void
}

export interface CanvasHandle {
  fitToContent: () => void
  fitToElements: (ids: string[]) => void
}

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond', 'triangle', 'hexagon', 'star', 'cloud']
const MIN_SHAPE_SIZE = 10
const GRID_SIZE = 20

function snapToGrid(v: number, gridEnabled: boolean): number {
  if (!gridEnabled) return v
  return Math.round(v / GRID_SIZE) * GRID_SIZE
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({
  activeTool, activeLineType, selectedIds, onSelectedIdsChange, onToolChange, onShapeCreated,
  elements, addShape, addPath, addLine, addArrow, addText, addImage, addFrame,
  updateElement, deleteElement, gridEnabled, darkMode, minimapVisible,
  setLastUsedStyle, groupElements, ungroupElements, stopCapturing,
}, ref) {
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const { awareness } = useCollab()
  const cursors = useCursors()

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Recently used colors (persists across PropertyPanel mount/unmount)
  const [recentColors, setRecentColors] = useState<string[]>([])
  const handleRecentColorAdd = useCallback((color: string) => {
    if (color && color !== 'transparent') {
      setRecentColors(prev => {
        if (prev.includes(color)) return prev
        return [color, ...prev].slice(0, 8)
      })
    }
  }, [])

  // Shape creation preview
  const [shapePreview, setShapePreview] = useState<{
    type: ShapeType
    x: number; y: number; w: number; h: number
  } | null>(null)

  // Drawing state
  const [drawingPath, setDrawingPath] = useState<{
    points: number[]; stroke: string; strokeWidth: number
  } | null>(null)

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeStart = useRef({ x: 0, y: 0 })
  const isMarquee = useRef(false)

  // Line/Arrow tool state
  const [lineStart, setLineStart] = useState<{ shapeId: string; freeX: number; freeY: number } | null>(null)
  const [linePreviewEnd, setLinePreviewEnd] = useState<{ x: number; y: number } | null>(null)
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null)

  // Alignment guides
  const [alignmentGuides, setAlignmentGuides] = useState<{ x?: number; y?: number; center?: boolean }[]>([])

  // Track selected lines' start positions for multi-drag
  const dragLineStarts = useRef<{ id: string; startX: number; startY: number; endX: number; endY: number }[]>([])

  // Track selected paths' start positions for multi-drag (from ShapeRenderer drag)
  const dragPathStarts = useRef<{ id: string; x: number; y: number; points: number[] }[]>([])

  // Track path-initiated drag starting positions (for direct path dragging)
  const pathDragOrigins = useRef<{
    paths: { id: string; x: number; y: number; points: number[] }[]
    shapes: { id: string; x: number; y: number }[]
    lines: { id: string; startX: number; startY: number; endX: number; endY: number }[]
  } | null>(null)

  // Track line-initiated drag starting positions (for direct line dragging)
  const lineDragOrigins = useRef<{
    paths: { id: string; x: number; y: number; points: number[] }[]
    shapes: { id: string; x: number; y: number }[]
    lines: { id: string; startX: number; startY: number; endX: number; endY: number }[]
  } | null>(null)

  // Connector label editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)

  // Eraser drag state
  const isErasing = useRef(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const shapeStart = useRef({ x: 0, y: 0 })
  const isCreatingShape = useRef(false)
  const isDrawing = useRef(false)
  const isPanningRef = useRef(false)
  const lastDrawPoint = useRef({ x: 0, y: 0 })
  const drawingPointsRef = useRef<number[]>([])
  const shapesRef = useRef<ShapeElement[]>([])
  const pathsRef = useRef<PathElement[]>([])
  const linesRef = useRef<LineElement[]>([])
  const selectedIdsRef = useRef<string[]>(selectedIds)
  selectedIdsRef.current = selectedIds

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - offset.x) / scale,
      y: (sy - offset.y) / scale,
    }),
    [offset, scale],
  )

  // Keep element lists current
  const shapes = elements.filter(isShape)
  const paths = elements.filter(isPath)
  const lines = elements.filter(isLine)
  const texts = elements.filter(isText)
  const images = elements.filter(isImage)
  const frames = elements.filter(isFrame)
  const webCards = elements.filter(isWebCard)
  shapesRef.current = shapes
  pathsRef.current = paths
  linesRef.current = lines

  // Space key for pan-anywhere
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('textarea, input')) {
        e.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        // Check if any selected elements are locked
        for (const id of selectedIds) {
          const el = elements.find(el => el.id === id)
          if (el && isShape(el) && el.locked) return // Don't delete locked shapes
        }
        for (const id of selectedIds) {
          deleteElement(id)
        }
        stopCapturing()
        onSelectedIdsChange([])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedIds, deleteElement, onSelectedIdsChange, elements])

  // Zoom keyboard shortcuts — handled directly to ensure synchronous state updates
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return
      const meta = e.metaKey || e.ctrlKey

      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setScale(s => Math.min(s * 1.2, 10))
        return
      }
      if (meta && e.key === '-') {
        e.preventDefault()
        setScale(s => Math.max(s * 0.8, 0.1))
        return
      }
      if (meta && e.key === '0') {
        e.preventDefault()
        setScale(1)
        setOffset({ x: 0, y: 0 })
        return
      }
      // Shift+1: zoom to fit all
      if (e.shiftKey && (e.key === '!' || e.code === 'Digit1')) {
        e.preventDefault()
        if (elements.length > 0) fitElements(elements)
        return
      }
      // Shift+2: zoom to fit selection
      if (e.shiftKey && (e.key === '@' || e.code === 'Digit2')) {
        e.preventDefault()
        const selected = elements.filter(el => selectedIds.includes(el.id))
        if (selected.length > 0) fitElements(selected)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [elements, selectedIds])

  const fitElements = useCallback((els: CanvasElement[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of els) {
      if ('x' in el && 'width' in el) {
        const s = el as ShapeElement
        minX = Math.min(minX, s.x)
        minY = Math.min(minY, s.y)
        maxX = Math.max(maxX, s.x + s.width)
        maxY = Math.max(maxY, s.y + s.height)
      } else if ('x' in el) {
        minX = Math.min(minX, el.x)
        minY = Math.min(minY, el.y)
        maxX = Math.max(maxX, el.x + 100)
        maxY = Math.max(maxY, el.y + 100)
      }
    }
    if (minX === Infinity) return
    const padding = 50
    const bw = maxX - minX + padding * 2
    const bh = maxY - minY + padding * 2
    const vw = window.innerWidth
    const vh = window.innerHeight
    const s = Math.min(vw / bw, vh / bh, 2)
    setScale(s)
    setOffset({
      x: (vw - bw * s) / 2 - minX * s + padding * s,
      y: (vh - bh * s) / 2 - minY * s + padding * s,
    })
  }, [])

  useImperativeHandle(ref, () => ({
    fitToContent() {
      if (elements.length > 0) fitElements(elements)
    },
    fitToElements(ids: string[]) {
      const filtered = elements.filter(el => ids.includes(el.id))
      if (filtered.length > 0) fitElements(filtered)
    },
  }), [elements, fitElements])

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      setIsPanning(true)
      isPanningRef.current = true
      panStart.current = { x: clientX, y: clientY }
      offsetStart.current = { ...offset }
    },
    [offset],
  )

  function pointInShape(s: ShapeElement, wx: number, wy: number): boolean {
    // Normalize to 0-1 coordinates within bounding box
    const nx = (wx - s.x) / s.width
    const ny = (wy - s.y) / s.height
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false

    switch (s.type) {
      case 'ellipse': {
        const dx = nx - 0.5, dy = ny - 0.5
        return dx * dx + dy * dy <= 0.25
      }
      case 'diamond': {
        return Math.abs(nx - 0.5) + Math.abs(ny - 0.5) <= 0.5
      }
      case 'triangle': {
        // Point-up triangle: vertices at (0.5,0), (0,1), (1,1)
        return ny >= 2 * Math.abs(nx - 0.5)
      }
      default:
        return true // rectangle, hexagon, star, cloud — use bounding box
    }
  }

  function hitTestShape(world: { x: number; y: number }): ShapeElement | undefined {
    for (let i = shapesRef.current.length - 1; i >= 0; i--) {
      const s = shapesRef.current[i]
      if (pointInShape(s, world.x, world.y)) return s
    }
    return undefined
  }

  function hitTestAnyElement(world: { x: number; y: number }): CanvasElement | undefined {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (isShape(el)) {
        if (pointInShape(el, world.x, world.y)) return el
      } else if (el.type === 'path') {
        const pts = (el as PathElement).points
        const HIT_DIST = 8
        for (let j = 0; j < pts.length - 2; j += 2) {
          const px = pts[j], py = pts[j + 1]
          const dx = world.x - px, dy = world.y - py
          if (dx * dx + dy * dy < HIT_DIST * HIT_DIST) return el
        }
      } else if ('width' in el && 'height' in el && 'x' in el && 'y' in el) {
        const s = el as { x: number; y: number; width: number; height: number }
        if (world.x >= s.x && world.x <= s.x + s.width && world.y >= s.y && world.y <= s.y + s.height) {
          return el
        }
      }
    }
    return undefined
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

      // Hand tool — always pan
      if (activeTool === 'hand') {
        startPan(e.clientX, e.clientY)
        return
      }

      // Eraser tool
      if (activeTool === 'eraser') {
        isErasing.current = true
        // Hit test and delete
        const hit = hitTestAnyElement(world)
        if (hit) deleteElement(hit.id)
        return
      }

      if (activeTool === 'select') {
        // Click on empty canvas = deselect + start marquee
        const target = e.target as HTMLElement
        const isCanvasOrWorld = target === e.currentTarget || target.classList.contains('canvas__world')
        if (isCanvasOrWorld) {
          onSelectedIdsChange([])
          setEditingId(null)
          marqueeStart.current = { x: world.x, y: world.y }
          isMarquee.current = true
          setMarquee({ x: world.x, y: world.y, w: 0, h: 0 })
        }
        return
      }

      if (activeTool === 'text') {
        const id = addText(world.x, world.y)
        stopCapturing()
        onSelectedIdsChange([id])
        setEditingId(id)
        onShapeCreated()
        return
      }

      if (SHAPE_TOOLS.includes(activeTool) || activeTool === 'frame') {
        isCreatingShape.current = true
        shapeStart.current = { x: world.x, y: world.y }
        if (activeTool === 'frame') {
          setShapePreview({
            type: 'rectangle',
            x: world.x, y: world.y, w: 0, h: 0,
          })
        } else {
          setShapePreview({
            type: activeTool as ShapeType,
            x: world.x, y: world.y, w: 0, h: 0,
          })
        }
        return
      }

      if (activeTool === 'draw') {
        isDrawing.current = true
        lastDrawPoint.current = { x: world.x, y: world.y }
        const initialPoints = [world.x, world.y]
        drawingPointsRef.current = initialPoints
        setDrawingPath({ points: initialPoints, stroke: '#4465e9', strokeWidth: 2.5 })
        return
      }

      if (activeTool === 'line') {
        const hitShape = hitTestShape(world)
        if (hitShape) {
          setLineStart({ shapeId: hitShape.id, freeX: world.x, freeY: world.y })
          setLinePreviewEnd({ x: world.x, y: world.y })
        }
        return
      }

      if (activeTool === 'arrow') {
        const hitShape = hitTestShape(world)
        if (hitShape) {
          setLineStart({ shapeId: hitShape.id, freeX: world.x, freeY: world.y })
        } else {
          setLineStart({ shapeId: '', freeX: world.x, freeY: world.y })
        }
        setLinePreviewEnd({ x: world.x, y: world.y })
        return
      }
    },
    [activeTool, screenToWorld, spaceHeld, startPan, onSelectedIdsChange, addText, onShapeCreated, deleteElement],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY)
      awareness.setLocalStateField('cursor', world)

      // Eraser drag
      if (isErasing.current && activeTool === 'eraser') {
        const hit = hitTestAnyElement(world)
        if (hit) deleteElement(hit.id)
        return
      }

      if (isMarquee.current) {
        const sx = marqueeStart.current.x
        const sy = marqueeStart.current.y
        setMarquee({
          x: Math.min(sx, world.x),
          y: Math.min(sy, world.y),
          w: Math.abs(world.x - sx),
          h: Math.abs(world.y - sy),
        })
        return
      }

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

      // Line/Arrow tool hover detection
      if (activeTool === 'line' || activeTool === 'arrow') {
        const hitShape = hitTestShape(world)
        setHoveredShapeId(hitShape ? hitShape.id : null)
        if (lineStart) {
          setLinePreviewEnd({ x: world.x, y: world.y })
        }
        return
      }
    },
    [screenToWorld, activeTool, lineStart, deleteElement],
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      // Eraser
      if (isErasing.current) {
        isErasing.current = false
        return
      }

      if (isMarquee.current) {
        isMarquee.current = false
        const world = screenToWorld(e.clientX, e.clientY)
        const sx = marqueeStart.current.x
        const sy = marqueeStart.current.y
        const rect = {
          x: Math.min(sx, world.x),
          y: Math.min(sy, world.y),
          w: Math.abs(world.x - sx),
          h: Math.abs(world.y - sy),
        }
        if (rect.w > 5 && rect.h > 5) {
          const ids: string[] = []
          for (const el of shapesRef.current) {
            if (el.x + el.width > rect.x && el.x < rect.x + rect.w &&
                el.y + el.height > rect.y && el.y < rect.y + rect.h) {
              ids.push(el.id)
            }
          }
          // Also include text elements
          for (const el of elements.filter(isText)) {
            if (el.x + el.width > rect.x && el.x < rect.x + rect.w &&
                el.y + el.height > rect.y && el.y < rect.y + rect.h) {
              ids.push(el.id)
            }
          }
          // Also include freehand paths (bounding box from points)
          for (const p of pathsRef.current) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            for (let i = 0; i < p.points.length; i += 2) {
              if (p.points[i] < minX) minX = p.points[i]
              if (p.points[i] > maxX) maxX = p.points[i]
              if (p.points[i + 1] < minY) minY = p.points[i + 1]
              if (p.points[i + 1] > maxY) maxY = p.points[i + 1]
            }
            if (maxX > rect.x && minX < rect.x + rect.w &&
                maxY > rect.y && minY < rect.y + rect.h) {
              ids.push(p.id)
            }
          }
          // Also include free-floating lines
          for (const l of linesRef.current) {
            const lMinX = Math.min(l.startX, l.endX)
            const lMaxX = Math.max(l.startX, l.endX)
            const lMinY = Math.min(l.startY, l.endY)
            const lMaxY = Math.max(l.startY, l.endY)
            if (lMaxX > rect.x && lMinX < rect.x + rect.w &&
                lMaxY > rect.y && lMinY < rect.y + rect.h) {
              ids.push(l.id)
            }
          }
          onSelectedIdsChange(ids)
        }
        setMarquee(null)
        return
      }

      if (isPanningRef.current) {
        setIsPanning(false)
        isPanningRef.current = false
        return
      }

      if (isCreatingShape.current) {
        isCreatingShape.current = false
        if (shapePreview && shapePreview.w >= MIN_SHAPE_SIZE && shapePreview.h >= MIN_SHAPE_SIZE) {
          const x = snapToGrid(shapePreview.x, gridEnabled)
          const y = snapToGrid(shapePreview.y, gridEnabled)
          const w = snapToGrid(shapePreview.w, gridEnabled) || shapePreview.w
          const h = snapToGrid(shapePreview.h, gridEnabled) || shapePreview.h

          if (activeTool === 'frame') {
            const id = addFrame(x, y, w, h)
            stopCapturing()
            onSelectedIdsChange([id])
          } else {
            const id = addShape(shapePreview.type, x, y, w, h)
            stopCapturing()
            onSelectedIdsChange([id])
          }
          onShapeCreated()
        } else {
          // Click without meaningful drag — auto-select shape under cursor
          const world = screenToWorld(e.clientX, e.clientY)
          const hit = hitTestAnyElement(world)
          if (hit) {
            onToolChange('select')
            onSelectedIdsChange([hit.id])
          }
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
          addPath(minX, minY, pts, '#4465e9', 2.5)
          stopCapturing()
        } else {
          // Click without drawing — auto-select shape under cursor
          const world = screenToWorld(e.clientX, e.clientY)
          const hit = hitTestAnyElement(world)
          if (hit) {
            onToolChange('select')
            onSelectedIdsChange([hit.id])
          }
        }
        drawingPointsRef.current = []
        setDrawingPath(null)
        return
      }

      if (lineStart) {
        const world = screenToWorld(e.clientX, e.clientY)
        const hitShape = hitTestShape(world)

        if (activeTool === 'line') {
          if (hitShape && hitShape.id !== lineStart.shapeId) {
            addLine(lineStart.shapeId, hitShape.id, activeLineType)
            stopCapturing()
          }
        } else if (activeTool === 'arrow') {
          const startShapeId = lineStart.shapeId
          const endShapeId = hitShape ? hitShape.id : ''

          const dx = world.x - lineStart.freeX
          const dy = world.y - lineStart.freeY
          if (dx * dx + dy * dy > 100) {
            addArrow(
              startShapeId, endShapeId,
              lineStart.freeX, lineStart.freeY,
              world.x, world.y,
              activeLineType,
            )
            stopCapturing()
          }
        }

        setLineStart(null)
        setLinePreviewEnd(null)
        return
      }
    },
    [shapePreview, addShape, addPath, addLine, addArrow, addFrame, onSelectedIdsChange, onShapeCreated, lineStart, screenToWorld, activeTool, activeLineType, gridEnabled, elements],
  )

  // Wheel → pan, pinch (ctrlKey) → zoom
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse wheel)
        const s = scaleRef.current
        const factor = e.deltaY > 0 ? 0.92 : 1.08
        const newScale = Math.min(Math.max(s * factor, 0.1), 10)
        const cx = e.clientX
        const cy = e.clientY
        setOffset((prev) => ({
          x: cx - (cx - prev.x) * (newScale / s),
          y: cy - (cy - prev.y) * (newScale / s),
        }))
        setScale(newScale)
      } else {
        // Regular scroll → pan
        setOffset((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const handleSelect = useCallback(
    (id: string, shiftKey?: boolean) => {
      if (activeTool === 'eraser') {
        deleteElement(id)
        return
      }

      // Auto-switch to select mode from creation tools
      if (activeTool !== 'select') {
        onToolChange('select')
      }

      // Check if clicked element belongs to a group
      const el = elements.find(e => e.id === id)
      if (el && isShape(el) && el.groupId && !shiftKey) {
        // Use outermost group (last in comma list) for selection
        const outermostGroup = el.groupId.split(',').pop()!
        const groupIds = elements
          .filter(e => isShape(e) && (e as ShapeElement).groupId?.split(',').includes(outermostGroup))
          .map(e => e.id)
        onSelectedIdsChange(groupIds)
        return
      }

      if (shiftKey) {
        onSelectedIdsChange(
          selectedIds.includes(id)
            ? selectedIds.filter((sid) => sid !== id)
            : [...selectedIds, id],
        )
      } else if (selectedIds.includes(id)) {
        // Already selected — keep the full selection so multi-drag works
      } else {
        onSelectedIdsChange([id])
      }
    },
    [activeTool, onToolChange, onSelectedIdsChange, selectedIds, elements, deleteElement],
  )

  const handleDoubleClick = useCallback(
    (id: string) => {
      if (activeTool === 'select') {
        // Check if element is in a group — double-click enters group
        const el = elements.find(e => e.id === id)
        if (el && isShape(el) && el.groupId) {
          onSelectedIdsChange([id])
          return
        }
      }
    },
    [activeTool, elements, onSelectedIdsChange],
  )

  const handlePathDragMove = useCallback(
    (id: string, dxScreen: number, dyScreen: number) => {
      const dx = dxScreen / scaleRef.current
      const dy = dyScreen / scaleRef.current
      // Capture starting positions on first move
      // Use refs to avoid stale closure — selectedIds/elements may not have flushed yet
      if (!pathDragOrigins.current) {
        const allIds = new Set(selectedIdsRef.current)
        allIds.add(id)
        const curPaths = pathsRef.current
        const curShapes = shapesRef.current
        const curLines = linesRef.current
        pathDragOrigins.current = {
          paths: curPaths.filter(p => allIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y, points: [...p.points] })),
          shapes: curShapes.filter(s => allIds.has(s.id)).map(s => ({ id: s.id, x: s.x, y: s.y })),
          lines: curLines.filter(l => allIds.has(l.id) && !l.startShapeId && !l.endShapeId).map(l => ({ id: l.id, startX: l.startX, startY: l.startY, endX: l.endX, endY: l.endY })),
        }
      }
      for (const ps of pathDragOrigins.current.paths) {
        const newPoints = ps.points.map((v: number, i: number) => v + (i % 2 === 0 ? dx : dy))
        updateElement(ps.id, { x: ps.x + dx, y: ps.y + dy, points: newPoints })
      }
      for (const ss of pathDragOrigins.current.shapes) {
        updateElement(ss.id, { x: ss.x + dx, y: ss.y + dy })
      }
      for (const ls of pathDragOrigins.current.lines) {
        updateElement(ls.id, {
          startX: ls.startX + dx, startY: ls.startY + dy,
          endX: ls.endX + dx, endY: ls.endY + dy,
        })
      }
    },
    [updateElement],
  )

  const handlePathDragEnd = useCallback(() => {
    pathDragOrigins.current = null
  }, [])

  const handleLineDragMove = useCallback(
    (id: string, dxScreen: number, dyScreen: number) => {
      const dx = dxScreen / scaleRef.current
      const dy = dyScreen / scaleRef.current
      // Use refs to avoid stale closure
      if (!lineDragOrigins.current) {
        const allIds = new Set(selectedIdsRef.current)
        allIds.add(id)
        const curPaths = pathsRef.current
        const curShapes = shapesRef.current
        const curLines = linesRef.current
        lineDragOrigins.current = {
          paths: curPaths.filter(p => allIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y, points: [...p.points] })),
          shapes: curShapes.filter(s => allIds.has(s.id)).map(s => ({ id: s.id, x: s.x, y: s.y })),
          lines: curLines.filter(l => allIds.has(l.id) && !l.startShapeId && !l.endShapeId).map(l => ({ id: l.id, startX: l.startX, startY: l.startY, endX: l.endX, endY: l.endY })),
        }
      }
      for (const ps of lineDragOrigins.current.paths) {
        const newPoints = ps.points.map((v: number, i: number) => v + (i % 2 === 0 ? dx : dy))
        updateElement(ps.id, { x: ps.x + dx, y: ps.y + dy, points: newPoints })
      }
      for (const ss of lineDragOrigins.current.shapes) {
        updateElement(ss.id, { x: ss.x + dx, y: ss.y + dy })
      }
      for (const ls of lineDragOrigins.current.lines) {
        updateElement(ls.id, {
          startX: ls.startX + dx, startY: ls.startY + dy,
          endX: ls.endX + dx, endY: ls.endY + dy,
        })
      }
    },
    [updateElement],
  )

  const handleLineDragEnd = useCallback(() => {
    lineDragOrigins.current = null
  }, [])

  const handleEndpointDrag = useCallback(
    (lineId: string, endpoint: 'start' | 'end', e: MouseEvent) => {
      const handleMove = (ev: globalThis.MouseEvent) => {
        const world = screenToWorld(ev.clientX, ev.clientY)
        if (endpoint === 'start') {
          updateElement(lineId, { startX: world.x, startY: world.y, startShapeId: '' })
        } else {
          updateElement(lineId, { endX: world.x, endY: world.y, endShapeId: '' })
        }
      }

      const handleUp = (ev: globalThis.MouseEvent) => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)

        const world = screenToWorld(ev.clientX, ev.clientY)
        const hitShape = hitTestShape(world)

        if (hitShape) {
          if (endpoint === 'start') {
            updateElement(lineId, { startShapeId: hitShape.id, startAnchorX: 0.5, startAnchorY: 0.5 })
          } else {
            updateElement(lineId, { endShapeId: hitShape.id, endAnchorX: 0.5, endAnchorY: 0.5 })
          }
        } else {
          if (endpoint === 'start') {
            updateElement(lineId, { startX: world.x, startY: world.y, startShapeId: '' })
          } else {
            updateElement(lineId, { endX: world.x, endY: world.y, endShapeId: '' })
          }
        }
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [screenToWorld, updateElement],
  )

  const handleStartEdit = useCallback(
    (id: string) => {
      if (activeTool === 'select') {
        setEditingId(id)
        onSelectedIdsChange([id])
      }
    },
    [activeTool, onSelectedIdsChange],
  )

  const handleStopEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // Clear editing when selection changes away
  useEffect(() => {
    if (editingId && editingId !== selectedId) {
      setEditingId(null)
    }
  }, [selectedId, editingId])

  // Broadcast selected IDs via awareness for remote selection
  useEffect(() => {
    awareness.setLocalStateField('selectedIds', selectedIds)
  }, [selectedIds, awareness])

  // Cursor class
  let cursorClass = 'canvas--tool-select'
  if (isPanning) cursorClass = 'canvas--panning'
  else if (spaceHeld) cursorClass = 'canvas--space-held'
  else if (activeTool === 'draw') cursorClass = 'canvas--tool-draw'
  else if (activeTool === 'line' || activeTool === 'arrow') cursorClass = 'canvas--tool-line'
  else if (SHAPE_TOOLS.includes(activeTool) || activeTool === 'frame') cursorClass = 'canvas--tool-shape'
  else if (activeTool === 'hand') cursorClass = 'canvas--tool-hand'
  else if (activeTool === 'eraser') cursorClass = 'canvas--tool-eraser'
  else if (activeTool === 'text') cursorClass = 'canvas--tool-text'

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
          <rect x={1} y={1} width={shapePreview.w - 2} height={shapePreview.h - 2} rx={8} fill="rgba(232, 237, 252, 0.5)" stroke="#4465e9" strokeWidth={2.5} strokeDasharray="6 3" />
        )}
        {shapePreview.type === 'ellipse' && (
          <ellipse cx={shapePreview.w / 2} cy={shapePreview.h / 2} rx={(shapePreview.w - 2) / 2} ry={(shapePreview.h - 2) / 2} fill="rgba(232, 237, 252, 0.5)" stroke="#4465e9" strokeWidth={2.5} strokeDasharray="6 3" />
        )}
        {shapePreview.type === 'diamond' && (
          <polygon points={`${shapePreview.w / 2},1 ${shapePreview.w - 1},${shapePreview.h / 2} ${shapePreview.w / 2},${shapePreview.h - 1} 1,${shapePreview.h / 2}`} fill="rgba(232, 237, 252, 0.5)" stroke="#4465e9" strokeWidth={2.5} strokeDasharray="6 3" />
        )}
        {shapePreview.type === 'triangle' && (
          <polygon points={`${shapePreview.w / 2},1 ${shapePreview.w - 1},${shapePreview.h - 1} 1,${shapePreview.h - 1}`} fill="rgba(232, 237, 252, 0.5)" stroke="#4465e9" strokeWidth={2.5} strokeDasharray="6 3" />
        )}
        {(shapePreview.type === 'hexagon' || shapePreview.type === 'star' || shapePreview.type === 'cloud') && (
          <rect x={1} y={1} width={shapePreview.w - 2} height={shapePreview.h - 2} fill="rgba(232, 237, 252, 0.5)" stroke="#4465e9" strokeWidth={2.5} strokeDasharray="6 3" />
        )}
      </svg>
    </div>
  ) : null

  // Connection highlight on hovered shape (line/arrow tool)
  const connectionHighlight = (activeTool === 'line' || activeTool === 'arrow') && hoveredShapeId ? (() => {
    const s = shapes.find((sh) => sh.id === hoveredShapeId)
    if (!s) return null
    return (
      <div
        className="connection-highlight"
        style={{
          position: 'absolute',
          left: s.x - 2,
          top: s.y - 2,
          width: s.width + 4,
          height: s.height + 4,
          border: '2px solid var(--accent)',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 300,
        }}
      />
    )
  })() : null

  // Line preview data for LineLayer
  const linePreviewData = lineStart && linePreviewEnd
    ? {
        startShapeId: lineStart.shapeId,
        freeStartX: lineStart.freeX,
        freeStartY: lineStart.freeY,
        endX: linePreviewEnd.x,
        endY: linePreviewEnd.y,
      }
    : null

  // Grid SVG
  const gridSvg = gridEnabled ? (
    <svg className="canvas__grid" style={{ position: 'absolute', top: -10000, left: -10000, width: 20000, height: 20000, pointerEvents: 'none' }}>
      <defs>
        <pattern id="grid-pattern" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <line x1={GRID_SIZE} y1={0} x2={GRID_SIZE} y2={GRID_SIZE} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
          <line x1={0} y1={GRID_SIZE} x2={GRID_SIZE} y2={GRID_SIZE} stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="20000" height="20000" fill="url(#grid-pattern)" />
    </svg>
  ) : null

  // Get selected elements for PropertyPanel (only in select mode)
  const selectedElements = elements.filter(el => selectedIds.includes(el.id))
  const showPropertyPanel = selectedElements.length > 0 && activeTool === 'select'

  return (
    <div
      ref={canvasRef}
      data-testid="canvas"
      className={`canvas ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="canvas__world"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        {gridSvg}
        <PathLayer
          paths={paths}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onDragMove={handlePathDragMove}
          onDragEnd={handlePathDragEnd}
          drawingPath={drawingPath}
        />
        <LineLayer
          shapes={shapes}
          lines={lines}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onDoubleClick={(id) => setEditingLabelId(id)}
          onDragMove={handleLineDragMove}
          onDragEnd={handleLineDragEnd}
          linePreview={linePreviewData}
          editingLabelId={editingLabelId}
          onLabelChange={(id, label) => updateElement(id, { label })}
          onLabelEditDone={() => setEditingLabelId(null)}
        />
        {/* Frames rendered below shapes — compute child containment */}
        {frames.map((frame) => {
          const childShapes = shapes.filter(s =>
            s.x >= frame.x && s.y >= frame.y &&
            s.x + s.width <= frame.x + frame.width &&
            s.y + s.height <= frame.y + frame.height
          )
          return (
            <FrameRenderer
              key={frame.id}
              frame={frame}
              isSelected={selectedIds.includes(frame.id)}
              onSelect={handleSelect}
              onUpdate={updateElement}
              scale={scale}
              activeTool={activeTool}
              elements={elements}
            >
              {childShapes.length > 0 && (
                <div style={{ position: 'absolute', left: -frame.x, top: -frame.y, width: 99999, height: 99999 }}>
                  {childShapes.map((shape) => (
                    <ShapeRenderer
                      key={shape.id}
                      shape={shape}
                      isSelected={selectedIds.includes(shape.id)}
                      onSelect={handleSelect}
                      onUpdate={updateElement}
                      onStartEdit={handleStartEdit}
                      editingId={editingId}
                      scale={scale}
                      activeTool={activeTool}
                    />
                  ))}
                </div>
              )}
            </FrameRenderer>
          )
        })}
        {/* Group wrapper divs */}
        {(() => {
          const groupIds = new Set<string>()
          for (const s of shapes) {
            if (s.groupId) {
              for (const gid of s.groupId.split(',')) {
                if (gid) groupIds.add(gid)
              }
            }
          }
          return Array.from(groupIds).map(gid => (
            <div key={`group-${gid}`} data-testid="group" data-group-id={gid} style={{ position: 'absolute', pointerEvents: 'none' }} />
          ))
        })()}
        {shapes.map((shape) => {
          // Compute drag siblings: group members + other selected shapes
          const outermostGroup = shape.groupId ? shape.groupId.split(',').pop() : ''
          const groupSibs = outermostGroup
            ? shapes.filter(s => s.groupId && s.groupId.split(',').pop() === outermostGroup && s.id !== shape.id)
            : []
          // If this shape is selected and there are other selected shapes, include them as drag siblings
          const selectedSibs = selectedIds.includes(shape.id)
            ? shapes.filter(s => selectedIds.includes(s.id) && s.id !== shape.id)
            : []
          // Merge, dedup by id
          const sibIds = new Set(groupSibs.map(s => s.id))
          const mergedSibs = [...groupSibs]
          for (const s of selectedSibs) {
            if (!sibIds.has(s.id)) mergedSibs.push(s)
          }
          const siblings = mergedSibs.length > 0
            ? mergedSibs.map(s => ({ id: s.id, x: s.x, y: s.y }))
            : undefined
          return (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              isSelected={selectedIds.includes(shape.id)}
              onSelect={handleSelect}
              onUpdate={updateElement}
              onStartEdit={handleStartEdit}
              editingId={editingId}
              scale={scale}
              activeTool={activeTool}
              gridEnabled={gridEnabled}
              onClone={addShape}
              groupSiblings={siblings}
              onDragMove={(id, x, y) => {
                // Compute alignment guides and snap
                const THRESHOLD = 5
                const dragging = shapes.find(s => s.id === id)
                if (!dragging) return
                const guides: { x?: number; y?: number; center?: boolean }[] = []
                let snapX: number | undefined, snapY: number | undefined
                const dragLeft = x, dragRight = x + dragging.width
                const dragTop = y, dragBottom = y + dragging.height
                const dragCx = x + dragging.width / 2, dragCy = y + dragging.height / 2
                for (const other of shapes) {
                  if (other.id === id) continue
                  if (other.groupId && other.groupId === dragging.groupId) continue
                  const oLeft = other.x, oRight = other.x + other.width
                  const oTop = other.y, oBottom = other.y + other.height
                  const oCx = other.x + other.width / 2, oCy = other.y + other.height / 2
                  // Vertical guides (x alignment) — center takes priority
                  if (Math.abs(dragCx - oCx) < THRESHOLD) { guides.push({ x: oCx, center: true }); snapX = oCx - dragging.width / 2 }
                  else if (Math.abs(dragLeft - oLeft) < THRESHOLD) { guides.push({ x: oLeft }); snapX = oLeft }
                  else if (Math.abs(dragRight - oRight) < THRESHOLD) { guides.push({ x: oRight }); snapX = oRight - dragging.width }
                  // Horizontal guides (y alignment) — center takes priority
                  if (Math.abs(dragCy - oCy) < THRESHOLD) { guides.push({ y: oCy, center: true }); snapY = oCy - dragging.height / 2 }
                  else if (Math.abs(dragTop - oTop) < THRESHOLD) { guides.push({ y: oTop }); snapY = oTop }
                  else if (Math.abs(dragBottom - oBottom) < THRESHOLD) { guides.push({ y: oBottom }); snapY = oBottom - dragging.height }
                }
                setAlignmentGuides(guides)
                // Apply snap
                if (snapX !== undefined || snapY !== undefined) {
                  updateElement(id, { x: snapX ?? x, y: snapY ?? y })
                }

                // Move selected free-floating lines by the same delta
                const actualX = snapX ?? x
                const actualY = snapY ?? y
                if (dragLineStarts.current.length === 0) {
                  // First move — capture starting positions using refs to avoid stale closures
                  dragLineStarts.current = linesRef.current
                    .filter(l => selectedIdsRef.current.includes(l.id) && !l.startShapeId && !l.endShapeId)
                    .map(l => ({ id: l.id, startX: l.startX, startY: l.startY, endX: l.endX, endY: l.endY }))
                }
                const dx = actualX - dragging.x
                const dy = actualY - dragging.y
                if (dragLineStarts.current.length > 0) {
                  for (const ls of dragLineStarts.current) {
                    updateElement(ls.id, {
                      startX: ls.startX + dx,
                      startY: ls.startY + dy,
                      endX: ls.endX + dx,
                      endY: ls.endY + dy,
                    })
                  }
                }

                // Move selected freehand paths by the same delta
                if (dragPathStarts.current.length === 0) {
                  dragPathStarts.current = pathsRef.current
                    .filter(p => selectedIdsRef.current.includes(p.id))
                    .map(p => ({ id: p.id, x: p.x, y: p.y, points: [...p.points] }))
                }
                if (dragPathStarts.current.length > 0) {
                  for (const ps of dragPathStarts.current) {
                    const newPoints = ps.points.map((v: number, i: number) => v + (i % 2 === 0 ? dx : dy))
                    updateElement(ps.id, { x: ps.x + dx, y: ps.y + dy, points: newPoints })
                  }
                }
              }}
              onDragEnd={() => { setAlignmentGuides([]); dragLineStarts.current = []; dragPathStarts.current = [] }}
            />
          )
        })}
        {/* Text elements */}
        {texts.map((textEl) => (
          <TextRenderer
            key={textEl.id}
            element={textEl}
            isSelected={selectedIds.includes(textEl.id)}
            isEditing={editingId === textEl.id}
            onSelect={handleSelect}
            onUpdate={updateElement}
            onStartEdit={handleStartEdit}
            onStopEdit={handleStopEdit}
            onDelete={deleteElement}
            scale={scale}
            activeTool={activeTool}
          />
        ))}
        {/* Image elements */}
        {images.map((img) => (
          <ImageRenderer
            key={img.id}
            element={img}
            isSelected={selectedIds.includes(img.id)}
            onSelect={handleSelect}
            onUpdate={updateElement}
            scale={scale}
            activeTool={activeTool}
          />
        ))}
        {webCards.map((wc) => (
          <WebCardRenderer
            key={wc.id}
            element={wc}
            isSelected={selectedIds.includes(wc.id)}
            onSelect={handleSelect}
            onUpdate={updateElement}
            scale={scale}
            activeTool={activeTool}
          />
        ))}
        {previewSvg}
        {connectionHighlight}
        {/* Endpoint handles for selected connectors */}
        {activeTool === 'select' && (() => {
          const selectedLines = lines.filter((l) => selectedIds.includes(l.id))
          if (selectedLines.length === 0) return null

          return selectedLines.map((selectedLine) => {
            const otherEndTarget = selectedLine.endShapeId
              ? (() => { const s = shapes.find(sh => sh.id === selectedLine.endShapeId); return s ? { x: s.x + s.width / 2, y: s.y + s.height / 2 } : null })()
              : { x: selectedLine.endX, y: selectedLine.endY }
            const otherStartTarget = selectedLine.startShapeId
              ? (() => { const s = shapes.find(sh => sh.id === selectedLine.startShapeId); return s ? { x: s.x + s.width / 2, y: s.y + s.height / 2 } : null })()
              : { x: selectedLine.startX, y: selectedLine.startY }

            const startPt = selectedLine.startShapeId
              ? (() => { const s = shapes.find(sh => sh.id === selectedLine.startShapeId); return s && otherEndTarget ? edgeIntersection(s, otherEndTarget) : null })()
              : { x: selectedLine.startX, y: selectedLine.startY }
            const endPt = selectedLine.endShapeId
              ? (() => { const s = shapes.find(sh => sh.id === selectedLine.endShapeId); return s && otherStartTarget ? edgeIntersection(s, otherStartTarget) : null })()
              : { x: selectedLine.endX, y: selectedLine.endY }

            return (
              <div key={`endpoints-${selectedLine.id}`}>
                {startPt && (
                  <div
                    className="endpoint-handle"
                    data-endpoint="start"
                    style={{ left: startPt.x - 5, top: startPt.y - 5 }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleEndpointDrag(selectedLine.id, 'start', e)
                    }}
                  />
                )}
                {endPt && (
                  <div
                    className="endpoint-handle"
                    data-endpoint="end"
                    style={{ left: endPt.x - 5, top: endPt.y - 5 }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      handleEndpointDrag(selectedLine.id, 'end', e)
                    }}
                  />
                )}
              </div>
            )
          })
        })()}
        {marquee && (
          <div
            className="marquee-selection"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
            }}
          />
        )}
        {/* Alignment guides */}
        {alignmentGuides.map((guide, i) => (
          <div
            key={i}
            className={`alignment-guide ${guide.center ? 'alignment-guide--center' : ''}`}
            style={{
              position: 'absolute',
              ...(guide.x !== undefined ? { left: guide.x, top: -5000, width: 1, height: 10000 } : {}),
              ...(guide.y !== undefined ? { left: -5000, top: guide.y, width: 10000, height: 1 } : {}),
            }}
          />
        ))}
        <Cursors cursors={cursors} />
      </div>

      {/* Property panel */}
      {showPropertyPanel && (
        <div onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
          <PropertyPanel
            elements={selectedElements}
            onUpdate={updateElement}
            setLastUsedStyle={setLastUsedStyle}
            recentColors={recentColors}
            onRecentColorAdd={handleRecentColorAdd}
          />
        </div>
      )}

      {/* Alignment toolbar */}
      {selectedIds.length >= 2 && activeTool === 'select' && (
        <div onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
          <AlignmentToolbar
            selectedIds={selectedIds}
            elements={elements}
            updateElement={updateElement}
          />
        </div>
      )}

      {/* Zoom indicator */}
      <div className="zoom-indicator" data-testid="zoom-level">
        {Math.round(scale * 100)}%
      </div>

      {/* Minimap */}
      {minimapVisible && (
        <Minimap
          elements={elements}
          offset={offset}
          scale={scale}
          onPan={(x, y) => setOffset({ x, y })}
        />
      )}
    </div>
  )
})
