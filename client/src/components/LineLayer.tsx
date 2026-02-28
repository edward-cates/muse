import type { ShapeElement, LineElement, Anchor, ArrowheadStyle } from '../types'
import { buildPath } from '../lib/pathBuilders'

interface Props {
  shapes: ShapeElement[]
  lines: LineElement[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDoubleClick?: (id: string) => void
  linePreview: { startShapeId: string; startAnchor: Anchor; freeStartX: number; freeStartY: number; endX: number; endY: number } | null
  editingLabelId?: string | null
  onLabelChange?: (id: string, label: string) => void
  onLabelEditDone?: () => void
}

export function getAnchorPoint(shape: ShapeElement, anchor: Anchor): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: shape.x + shape.width / 2, y: shape.y }
    case 'right':
      return { x: shape.x + shape.width, y: shape.y + shape.height / 2 }
    case 'bottom':
      return { x: shape.x + shape.width / 2, y: shape.y + shape.height }
    case 'left':
      return { x: shape.x, y: shape.y + shape.height / 2 }
  }
}

export function findClosestAnchors(
  shapeA: ShapeElement,
  shapeB: ShapeElement,
): { startAnchor: Anchor; endAnchor: Anchor } {
  const anchors: Anchor[] = ['top', 'right', 'bottom', 'left']
  let bestDist = Infinity
  let bestStart: Anchor = 'right'
  let bestEnd: Anchor = 'left'

  for (const a of anchors) {
    const pa = getAnchorPoint(shapeA, a)
    for (const b of anchors) {
      const pb = getAnchorPoint(shapeB, b)
      const dx = pa.x - pb.x
      const dy = pa.y - pb.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestStart = a
        bestEnd = b
      }
    }
  }

  return { startAnchor: bestStart, endAnchor: bestEnd }
}

function resolveEndpoint(
  shapeId: string,
  anchor: Anchor,
  freeX: number,
  freeY: number,
  shapeMap: Map<string, ShapeElement>,
): { x: number; y: number } {
  if (shapeId) {
    const shape = shapeMap.get(shapeId)
    if (shape) return getAnchorPoint(shape, anchor)
  }
  return { x: freeX, y: freeY }
}

function getStrokeDasharray(strokeStyle: string | undefined, strokeWidth: number): string | undefined {
  if (!strokeStyle || strokeStyle === 'solid') return undefined
  if (strokeStyle === 'dashed') return `${strokeWidth * 4} ${strokeWidth * 3}`
  if (strokeStyle === 'dotted') return `${strokeWidth} ${strokeWidth * 2}`
  return undefined
}

function renderMarker(id: string, style: ArrowheadStyle, stroke: string, isStart: boolean) {
  const refX = isStart ? 1 : 9
  const orient = 'auto'

  switch (style) {
    case 'triangle':
      return (
        <marker key={id} id={id} markerWidth="10" markerHeight="7" refX={String(refX)} refY="3.5" orient={orient}>
          {isStart
            ? <polygon points="10 0, 0 3.5, 10 7" fill={stroke} />
            : <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />}
        </marker>
      )
    case 'open':
      return (
        <marker key={id} id={id} markerWidth="10" markerHeight="7" refX={String(refX)} refY="3.5" orient={orient}>
          {isStart
            ? <polyline points="10 0, 0 3.5, 10 7" fill="none" stroke={stroke} strokeWidth="1.5" />
            : <polyline points="0 0, 10 3.5, 0 7" fill="none" stroke={stroke} strokeWidth="1.5" />}
        </marker>
      )
    case 'diamond':
      return (
        <marker key={id} id={id} markerWidth="12" markerHeight="8" refX="6" refY="4" orient={orient}>
          <polygon points="0 4, 6 0, 12 4, 6 8" fill={stroke} />
        </marker>
      )
    case 'circle':
      return (
        <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="4" refY="4" orient={orient}>
          <circle cx="4" cy="4" r="3" fill={stroke} />
        </marker>
      )
    default:
      return null
  }
}

export function LineLayer({ shapes, lines, selectedId, onSelect, onDoubleClick, linePreview, editingLabelId, onLabelChange, onLabelEditDone }: Props) {
  const shapeMap = new Map(shapes.map((s) => [s.id, s]))

  const previewStart = linePreview
    ? (() => {
        if (linePreview.startShapeId) {
          const shape = shapeMap.get(linePreview.startShapeId)
          if (shape) return getAnchorPoint(shape, linePreview.startAnchor)
        }
        return { x: linePreview.freeStartX, y: linePreview.freeStartY }
      })()
    : null

  return (
    <svg
      className="canvas__lines"
      style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, width: 5000, height: 5000 }}
    >
      <defs>
        {lines.map((line) => {
          const stroke = line.id === selectedId ? '#4f46e5' : line.stroke
          const markers: React.ReactNode[] = []

          // End marker
          const endStyle = line.arrowEndStyle || (line.arrowEnd ? 'triangle' : 'none')
          if (endStyle !== 'none') {
            markers.push(renderMarker(`arrowhead-${endStyle}-end-${line.id}`, endStyle, stroke, false))
          }

          // Start marker
          const startStyle = line.arrowStartStyle || (line.arrowStart ? 'triangle' : 'none')
          if (startStyle !== 'none') {
            markers.push(renderMarker(`arrowhead-${startStyle}-start-${line.id}`, startStyle, stroke, true))
          }

          return markers
        })}
        {/* Preview arrowhead */}
        <marker id="arrowhead-preview" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#4f46e5" />
        </marker>
      </defs>

      {lines.map((line) => {
        const start = resolveEndpoint(line.startShapeId, line.startAnchor, line.startX, line.startY, shapeMap)
        const end = resolveEndpoint(line.endShapeId, line.endAnchor, line.endX, line.endY, shapeMap)

        if (line.startShapeId && !shapeMap.has(line.startShapeId)) return null
        if (line.endShapeId && !shapeMap.has(line.endShapeId)) return null

        const isSelected = line.id === selectedId
        const stroke = isSelected ? '#4f46e5' : line.stroke
        const sw = isSelected ? line.strokeWidth + 1 : line.strokeWidth
        const d = buildPath(line.lineType, start, end)
        const dashArray = getStrokeDasharray(line.strokeStyle, sw)
        const lineOpacity = (line.opacity ?? 100) / 100

        const endStyle = line.arrowEndStyle || (line.arrowEnd ? 'triangle' : 'none')
        const startStyle = line.arrowStartStyle || (line.arrowStart ? 'triangle' : 'none')

        // Compute midpoint for label
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2

        return (
          <g key={line.id}>
            {/* Wide invisible hit area rendered below for easy clicking */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={Math.max(12, sw + 10)}
              fill="none"
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(line.id) }}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(line.id) }}
            />
            {/* Visible connector on top — uses bounding-box pointer-events so it's clickable even when arrowhead markers shift the bounding box center away from the stroke */}
            <path
              className="connector"
              d={d}
              stroke={stroke}
              strokeWidth={sw}
              fill="none"
              strokeDasharray={dashArray}
              opacity={lineOpacity}
              markerEnd={endStyle !== 'none' ? `url(#arrowhead-${endStyle}-end-${line.id})` : undefined}
              markerStart={startStyle !== 'none' ? `url(#arrowhead-${startStyle}-start-${line.id})` : undefined}
              style={{ pointerEvents: 'bounding-box' as unknown as React.CSSProperties['pointerEvents'], cursor: 'pointer' }}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(line.id) }}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(line.id) }}
            />
            {/* Connector label editor */}
            {editingLabelId === line.id && (
              <foreignObject x={midX - 60} y={midY - 14} width={120} height={28} style={{ overflow: 'visible' }}>
                <div {...{ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, string>}>
                  <input
                    className="connector-label-editor"
                    autoFocus
                    defaultValue={line.label || ''}
                    style={{ width: '100%', textAlign: 'center', fontSize: 12, border: '1px solid #4f46e5', borderRadius: 3, padding: '2px 4px', outline: 'none', boxSizing: 'border-box' }}
                    ref={(el) => { if (el) setTimeout(() => el.focus(), 0) }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        onLabelChange?.(line.id, (e.target as HTMLInputElement).value)
                        onLabelEditDone?.()
                      }
                    }}
                    onBlur={(e) => {
                      onLabelChange?.(line.id, e.target.value)
                      onLabelEditDone?.()
                    }}
                  />
                </div>
              </foreignObject>
            )}
            {/* Connector label display */}
            {line.label && editingLabelId !== line.id && (
              <foreignObject x={midX - 50} y={midY - 12} width={100} height={24} style={{ pointerEvents: 'none', overflow: 'visible' }}>
                <div {...{ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, string>} className="connector-label" style={{ textAlign: 'center', fontSize: 12, background: 'white', padding: '0 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                  {line.label}
                </div>
              </foreignObject>
            )}
          </g>
        )
      })}

      {/* Line preview while dragging */}
      {previewStart && linePreview && (
        <path
          d={`M ${previewStart.x} ${previewStart.y} L ${linePreview.endX} ${linePreview.endY}`}
          stroke="#4f46e5"
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="6 3"
          opacity={0.6}
          markerEnd="url(#arrowhead-preview)"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  )
}
