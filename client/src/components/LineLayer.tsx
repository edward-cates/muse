import type { ShapeElement, LineElement, Anchor } from '../types'

interface Props {
  shapes: ShapeElement[]
  lines: LineElement[]
  selectedId: string | null
  onSelect: (id: string) => void
  linePreview: { startShapeId: string; startAnchor: Anchor; endX: number; endY: number } | null
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

export function LineLayer({ shapes, lines, selectedId, onSelect, linePreview }: Props) {
  const shapeMap = new Map(shapes.map((s) => [s.id, s]))

  const previewStartShape = linePreview ? shapeMap.get(linePreview.startShapeId) : null
  const previewStart = previewStartShape && linePreview
    ? getAnchorPoint(previewStartShape, linePreview.startAnchor)
    : null

  return (
    <svg
      className="canvas__lines"
      style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#4f46e5" />
        </marker>
      </defs>

      {lines.map((line) => {
        const startShape = shapeMap.get(line.startShapeId)
        const endShape = shapeMap.get(line.endShapeId)
        if (!startShape || !endShape) return null

        const start = getAnchorPoint(startShape, line.startAnchor)
        const end = getAnchorPoint(endShape, line.endAnchor)
        const isSelected = line.id === selectedId

        return (
          <g key={line.id}>
            <line
              x1={start.x} y1={start.y} x2={end.x} y2={end.y}
              stroke="transparent" strokeWidth={12}
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
              onMouseDown={(e) => { e.stopPropagation(); onSelect(line.id) }}
            />
            <line
              x1={start.x} y1={start.y} x2={end.x} y2={end.y}
              stroke={isSelected ? '#4f46e5' : line.stroke}
              strokeWidth={isSelected ? line.strokeWidth + 1 : line.strokeWidth}
              markerEnd="url(#arrowhead)"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}

      {/* Line preview while dragging */}
      {previewStart && linePreview && (
        <line
          x1={previewStart.x} y1={previewStart.y}
          x2={linePreview.endX} y2={linePreview.endY}
          stroke="#4f46e5" strokeWidth={1.5}
          strokeDasharray="6 3" opacity={0.6}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  )
}
