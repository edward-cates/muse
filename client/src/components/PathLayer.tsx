import type { PathElement } from '../types'

interface Props {
  paths: PathElement[]
  selectedIds: string[]
  onSelect: (id: string, shiftKey?: boolean) => void
  onDragMove?: (id: string, dx: number, dy: number) => void
  onDragEnd?: () => void
  drawingPath: { points: number[]; stroke: string; strokeWidth: number } | null
}

/** Convert flat point array to a smooth SVG path using quadratic bezier curves */
function pointsToSvgPath(pts: number[]): string {
  if (pts.length < 4) return ''
  if (pts.length < 6) {
    return `M${pts[0]},${pts[1]} L${pts[2]},${pts[3]}`
  }

  let d = `M${pts[0]},${pts[1]}`
  // Use the midpoints as on-curve points and actual points as control points
  for (let i = 2; i < pts.length - 2; i += 2) {
    const cpx = pts[i]
    const cpy = pts[i + 1]
    const nx = pts[i + 2]
    const ny = pts[i + 3]
    const midx = (cpx + nx) / 2
    const midy = (cpy + ny) / 2
    d += ` Q${cpx},${cpy} ${midx},${midy}`
  }
  // Final segment
  const last = pts.length
  d += ` L${pts[last - 2]},${pts[last - 1]}`
  return d
}

export function PathLayer({ paths, selectedIds, onSelect, onDragMove, onDragEnd, drawingPath }: Props) {
  return (
    <svg className="canvas__paths" style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, width: 5000, height: 5000 }}>
      {paths.map((p) => {
        const d = pointsToSvgPath(p.points.map((v, i) => (i % 2 === 0 ? v - p.x : v - p.y)))
        const isSelected = selectedIds.includes(p.id)
        return (
          <g
            key={p.id}
            transform={`translate(${p.x},${p.y})`}
          >
            {/* Invisible fat hit area — onMouseDown here because <g> inherits
                pointer-events:none from .canvas__paths, so only <path> children
                with pointer-events:stroke reliably receive events */}
            <path
              className="path-hitarea"
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
              onMouseDown={(e) => {
                e.stopPropagation()
                onSelect(p.id, e.shiftKey)

                // Start drag — per-event listeners (same pattern as ShapeRenderer)
                const startX = e.clientX
                const startY = e.clientY
                const handleMove = (ev: globalThis.MouseEvent) => {
                  const dx = ev.clientX - startX
                  const dy = ev.clientY - startY
                  onDragMove?.(p.id, dx, dy)
                }
                const handleUp = () => {
                  onDragEnd?.()
                  window.removeEventListener('mousemove', handleMove)
                  window.removeEventListener('mouseup', handleUp)
                }
                window.addEventListener('mousemove', handleMove)
                window.addEventListener('mouseup', handleUp)
              }}
            />
            {/* Selection glow behind selected paths */}
            {isSelected && (
              <path
                d={d}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={p.strokeWidth + 6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Visible stroke */}
            <path
              d={d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={isSelected ? p.strokeWidth + 1 : p.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isSelected ? 'path--selected' : ''}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        )
      })}
      {/* In-progress drawing stroke */}
      {drawingPath && drawingPath.points.length >= 4 && (
        <path
          d={pointsToSvgPath(drawingPath.points)}
          fill="none"
          stroke={drawingPath.stroke}
          strokeWidth={drawingPath.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />
      )}
    </svg>
  )
}
