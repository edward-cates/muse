import type { ShapeElement, LineElement, ArrowheadStyle } from '../types'
import { buildPath } from '../lib/pathBuilders'

interface Props {
  shapes: ShapeElement[]
  lines: LineElement[]
  selectedIds: string[]
  onSelect: (id: string, shiftKey?: boolean) => void
  onDoubleClick?: (id: string) => void
  onDragMove?: (id: string, dx: number, dy: number) => void
  onDragEnd?: () => void
  linePreview: { startShapeId: string; startAnchorX: number; startAnchorY: number; freeStartX: number; freeStartY: number; endX: number; endY: number } | null
  editingLabelId?: string | null
  onLabelChange?: (id: string, label: string) => void
  onLabelEditDone?: () => void
}

export function getAnchorPoint(shape: ShapeElement, ratioX: number, ratioY: number): { x: number; y: number } {
  return { x: shape.x + ratioX * shape.width, y: shape.y + ratioY * shape.height }
}

function resolveEndpoint(
  shapeId: string,
  anchorX: number,
  anchorY: number,
  freeX: number,
  freeY: number,
  shapeMap: Map<string, ShapeElement>,
): { x: number; y: number } {
  if (shapeId) {
    const shape = shapeMap.get(shapeId)
    if (shape) return getAnchorPoint(shape, anchorX, anchorY)
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
  const refX = isStart ? 1 : 11
  const orient = 'auto'

  switch (style) {
    case 'triangle':
      return (
        <marker key={id} id={id} markerWidth="12" markerHeight="8" refX={String(refX)} refY="4" orient={orient}>
          {isStart
            ? <polygon points="12 0, 0 4, 12 8, 9 4" fill={stroke} />
            : <polygon points="0 0, 12 4, 0 8, 3 4" fill={stroke} />}
        </marker>
      )
    case 'open':
      return (
        <marker key={id} id={id} markerWidth="12" markerHeight="8" refX={String(refX)} refY="4" orient={orient}>
          {isStart
            ? <polyline points="12 0, 0 4, 12 8" fill="none" stroke={stroke} strokeWidth="1.5" />
            : <polyline points="0 0, 12 4, 0 8" fill="none" stroke={stroke} strokeWidth="1.5" />}
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

export function LineLayer({ shapes, lines, selectedIds, onSelect, onDoubleClick, onDragMove, onDragEnd, linePreview, editingLabelId, onLabelChange, onLabelEditDone }: Props) {
  const shapeMap = new Map(shapes.map((s) => [s.id, s]))

  const previewStart = linePreview
    ? (() => {
        if (linePreview.startShapeId) {
          const shape = shapeMap.get(linePreview.startShapeId)
          if (shape) return getAnchorPoint(shape, linePreview.startAnchorX, linePreview.startAnchorY)
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
          const stroke = line.stroke
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
        <marker id="arrowhead-preview" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
          <polygon points="0 0, 12 4, 0 8, 3 4" fill="#4465e9" />
        </marker>
      </defs>

      {lines.map((line) => {
        const start = resolveEndpoint(line.startShapeId, line.startAnchorX, line.startAnchorY, line.startX, line.startY, shapeMap)
        const end = resolveEndpoint(line.endShapeId, line.endAnchorX, line.endAnchorY, line.endX, line.endY, shapeMap)

        if (line.startShapeId && !shapeMap.has(line.startShapeId)) return null
        if (line.endShapeId && !shapeMap.has(line.endShapeId)) return null

        const isSelected = selectedIds.includes(line.id)
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
          <g
            key={line.id}
          >
            {/* Wide invisible hit area for easy clicking — onMouseDown here
                because <g> inherits pointer-events:none from .canvas__lines */}
            <path
              className="path-hitarea"
              d={d}
              stroke="transparent"
              strokeWidth={Math.max(12, sw + 10)}
              fill="none"
              onMouseDown={(e) => {
                e.stopPropagation()
                onSelect(line.id, e.shiftKey)
                const startX = e.clientX
                const startY = e.clientY
                const handleMove = (ev: globalThis.MouseEvent) => {
                  onDragMove?.(line.id, ev.clientX - startX, ev.clientY - startY)
                }
                const handleUp = () => {
                  onDragEnd?.()
                  window.removeEventListener('mousemove', handleMove)
                  window.removeEventListener('mouseup', handleUp)
                }
                window.addEventListener('mousemove', handleMove)
                window.addEventListener('mouseup', handleUp)
              }}
              onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(line.id) }}
            />
            {/* Selection glow behind selected connectors */}
            {isSelected && (
              <path
                d={d}
                stroke="#f59e0b"
                strokeWidth={sw + 4}
                fill="none"
                opacity={0.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Visible connector */}
            <path
              className="connector"
              d={d}
              stroke={line.stroke}
              strokeWidth={sw}
              fill="none"
              strokeDasharray={dashArray}
              opacity={lineOpacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={endStyle !== 'none' ? `url(#arrowhead-${endStyle}-end-${line.id})` : undefined}
              markerStart={startStyle !== 'none' ? `url(#arrowhead-${startStyle}-start-${line.id})` : undefined}
              style={{ pointerEvents: 'none' }}
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
          stroke="#4465e9"
          strokeWidth={2.5}
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
