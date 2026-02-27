import type { PathElement } from '../types'

interface Props {
  paths: PathElement[]
  selectedId: string | null
  onSelect: (id: string) => void
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

export function PathLayer({ paths, selectedId, onSelect, drawingPath }: Props) {
  return (
    <svg className="canvas__paths" style={{ overflow: 'visible', position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
      {paths.map((p) => {
        const d = pointsToSvgPath(p.points.map((v, i) => (i % 2 === 0 ? v - p.x : v - p.y)))
        const isSelected = p.id === selectedId
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            {/* Invisible fat hit area */}
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
                onSelect(p.id)
              }}
            />
            {/* Visible stroke */}
            <path
              d={d}
              fill="none"
              stroke={isSelected ? '#4f46e5' : p.stroke}
              strokeWidth={isSelected ? p.strokeWidth + 1 : p.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isSelected ? 'path--selected' : ''}
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
