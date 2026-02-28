import { useState, useEffect } from 'react'
import { isShape, isLine } from '../types'
import type { CanvasElement, ShapeElement, LineElement, LineType } from '../types'

interface Props {
  element: CanvasElement
  onUpdate: (id: string, updates: Record<string, unknown>) => void
}

export function PropertyPanel({ element, onUpdate }: Props) {
  const [fill, setFill] = useState('')
  const [stroke, setStroke] = useState('')
  const [strokeWidth, setStrokeWidth] = useState('')
  const [lineType, setLineType] = useState<LineType>('straight')

  useEffect(() => {
    if (isShape(element)) {
      setFill(element.fill)
      setStroke(element.stroke)
      setStrokeWidth(String(element.strokeWidth))
    } else if (isLine(element)) {
      setFill('')
      setStroke(element.stroke)
      setStrokeWidth(String(element.strokeWidth))
      setLineType(element.lineType)
    }
  }, [element])

  const showFill = isShape(element)
  const showLineType = isLine(element)

  const commitFill = () => {
    if (showFill && fill !== (element as ShapeElement).fill) {
      onUpdate(element.id, { fill })
    }
  }

  const commitStroke = () => {
    const current = isShape(element) ? (element as ShapeElement).stroke : (element as LineElement).stroke
    if (stroke !== current) {
      onUpdate(element.id, { stroke })
    }
  }

  const commitStrokeWidth = () => {
    const val = parseFloat(strokeWidth)
    if (!isNaN(val) && val > 0) {
      onUpdate(element.id, { strokeWidth: val })
    }
  }

  return (
    <div className="property-panel" data-testid="property-panel">
      {showFill && (
        <label className="property-panel__field">
          <span className="property-panel__label">Fill</span>
          <input
            data-testid="prop-fill"
            type="text"
            value={fill}
            onChange={(e) => setFill(e.target.value)}
            onBlur={commitFill}
            onKeyDown={(e) => { if (e.key === 'Enter') commitFill() }}
          />
        </label>
      )}
      <label className="property-panel__field">
        <span className="property-panel__label">Stroke</span>
        <input
          data-testid="prop-stroke"
          type="text"
          value={stroke}
          onChange={(e) => setStroke(e.target.value)}
          onBlur={commitStroke}
          onKeyDown={(e) => { if (e.key === 'Enter') commitStroke() }}
        />
      </label>
      <label className="property-panel__field">
        <span className="property-panel__label">Width</span>
        <input
          data-testid="prop-stroke-width"
          type="text"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(e.target.value)}
          onBlur={commitStrokeWidth}
          onKeyDown={(e) => { if (e.key === 'Enter') commitStrokeWidth() }}
        />
      </label>
      {showLineType && (
        <label className="property-panel__field">
          <span className="property-panel__label">Line Type</span>
          <select
            data-testid="prop-line-type"
            value={lineType}
            onChange={(e) => {
              const val = e.target.value as LineType
              setLineType(val)
              onUpdate(element.id, { lineType: val })
            }}
          >
            <option value="straight">Straight</option>
            <option value="elbow">Elbow</option>
            <option value="curve">Curve</option>
          </select>
        </label>
      )}
    </div>
  )
}
