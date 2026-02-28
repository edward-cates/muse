import type { ShapeElement, LineElement, Anchor } from '../types'
import { buildPath } from '../lib/pathBuilders'

interface Props {
  shapes: ShapeElement[]
  lines: LineElement[]
  selectedId: string | null
  onSelect: (id: string) => void
  linePreview: { startShapeId: string; startAnchor: Anchor; freeStartX: number; freeStartY: number; endX: number; endY: number } | null
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

export function LineLayer({ shapes, lines, selectedId, onSelect, linePreview }: Props) {
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
      style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0 }}
    >
      <defs>
        {lines.map((line) => {
          const stroke = line.id === selectedId ? '#4f46e5' : line.stroke
          if (line.arrowEnd) {
            return (
              <marker
                key={`arrow-end-${line.id}`}
                id={`arrowhead-end-${line.id}`}
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
              </marker>
            )
          }
          return null
        })}
        {lines.map((line) => {
          const stroke = line.id === selectedId ? '#4f46e5' : line.stroke
          if (line.arrowStart) {
            return (
              <marker
                key={`arrow-start-${line.id}`}
                id={`arrowhead-start-${line.id}`}
                markerWidth="10"
                markerHeight="7"
                refX="1"
                refY="3.5"
                orient="auto"
              >
                <polygon points="10 0, 0 3.5, 10 7" fill={stroke} />
              </marker>
            )
          }
          return null
        })}
        {/* Preview arrowhead */}
        <marker id="arrowhead-preview" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#4f46e5" />
        </marker>
      </defs>

      {lines.map((line) => {
        const start = resolveEndpoint(line.startShapeId, line.startAnchor, line.startX, line.startY, shapeMap)
        const end = resolveEndpoint(line.endShapeId, line.endAnchor, line.endX, line.endY, shapeMap)

        // Skip rendering if both endpoints resolve to an unconnected shape that was deleted
        if (line.startShapeId && !shapeMap.has(line.startShapeId)) return null
        if (line.endShapeId && !shapeMap.has(line.endShapeId)) return null

        const isSelected = line.id === selectedId
        const stroke = isSelected ? '#4f46e5' : line.stroke
        const sw = isSelected ? line.strokeWidth + 1 : line.strokeWidth
        const d = buildPath(line.lineType, start, end)

        return (
          <g key={line.id}>
            {/* Wide invisible hit area */}
            <path
              d={d}
              stroke="transparent"
              strokeWidth={12}
              fill="none"
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(line.id) }}
            />
            {/* Visible connector */}
            <path
              className="connector"
              d={d}
              stroke={stroke}
              strokeWidth={sw}
              fill="none"
              markerEnd={line.arrowEnd ? `url(#arrowhead-end-${line.id})` : undefined}
              markerStart={line.arrowStart ? `url(#arrowhead-start-${line.id})` : undefined}
              style={{ pointerEvents: 'none' }}
            />
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
