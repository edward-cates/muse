import { useState, useEffect, useCallback } from 'react'
import { isShape, isLine, isText } from '../types'
import type { CanvasElement, ShapeElement, LineElement, TextElement, LineType, StrokeStyle, ArrowheadStyle } from '../types'

const PRESET_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc',
  '#d5a6bd', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af',
  '#6fa8dc', '#8e7cc3', '#c27ba0', '#a64d79', '#e74c3c', '#e67e22',
  '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#4f46e5',
]

interface Props {
  elements: CanvasElement[]
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  setLastUsedStyle: (fill: string, stroke: string) => void
  recentColors: string[]
  onRecentColorAdd: (color: string) => void
}

function ColorPicker({ value, onChange, pickerClass, recentColors, testId }: {
  value: string
  onChange: (color: string) => void
  pickerClass: string
  recentColors: string[]
  testId?: string
}) {
  const [hexInput, setHexInput] = useState(value)

  useEffect(() => { setHexInput(value) }, [value])

  const allColors = [...PRESET_COLORS]
  // Add recent colors that aren't already in presets
  for (const c of recentColors) {
    if (!allColors.includes(c) && c !== 'transparent') {
      allColors.push(c)
    }
  }

  return (
    <div className={`color-picker ${pickerClass}`}>
      <div className="color-picker__swatches">
        <div
          className="color-swatch color-swatch--transparent"
          data-color="transparent"
          onClick={() => onChange('transparent')}
          style={{ background: 'linear-gradient(135deg, #fff 45%, #e74c3c 45%, #e74c3c 55%, #fff 55%)' }}
        />
        {allColors.map((color) => (
          <div
            key={color}
            className="color-swatch"
            data-color={color}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      <div className="color-picker__hex">
        <input
          type="text"
          data-testid={testId}
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={() => onChange(hexInput)}
          onKeyDown={(e) => { if (e.key === 'Enter') onChange(hexInput) }}
        />
        <input
          type="color"
          value={value === 'transparent' ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 24, height: 24, padding: 0, border: 'none', cursor: 'pointer' }}
        />
      </div>
    </div>
  )
}

export function PropertyPanel({ elements, onUpdate, setLastUsedStyle, recentColors, onRecentColorAdd }: Props) {
  const [fill, setFill] = useState('')
  const [stroke, setStroke] = useState('')
  const [strokeWidth, setStrokeWidth] = useState('')
  const [lineType, setLineType] = useState<LineType>('straight')
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid')
  const [opacity, setOpacity] = useState(100)
  const [cornerRadius, setCornerRadius] = useState(3)
  const [shadow, setShadow] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [fontSize, setFontSize] = useState(14)
  const [fontFamily, setFontFamily] = useState('sans-serif')
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center')
  const [verticalAlign, setVerticalAlign] = useState<'top' | 'middle' | 'bottom'>('middle')
  const [posX, setPosX] = useState(0)
  const [posY, setPosY] = useState(0)
  const [sizeW, setSizeW] = useState(0)
  const [sizeH, setSizeH] = useState(0)
  const [connectorLabel, setConnectorLabel] = useState('')
  const [arrowStartStyle, setArrowStartStyle] = useState<ArrowheadStyle>('none')
  const [arrowEndStyle, setArrowEndStyle] = useState<ArrowheadStyle>('triangle')

  const element = elements[0]
  const isMulti = elements.length > 1

  useEffect(() => {
    if (!element) return

    if (isShape(element)) {
      setFill(element.fill)
      setStroke(element.stroke)
      setStrokeWidth(String(element.strokeWidth))
      setStrokeStyle(element.strokeStyle || 'solid')
      setOpacity(element.opacity ?? 100)
      setCornerRadius(element.cornerRadius ?? 3)
      setShadow(element.shadow ?? false)
      setRotation(element.rotation ?? 0)
      setFontSize(element.fontSize ?? 14)
      setFontFamily(element.fontFamily ?? 'sans-serif')
      setTextAlign(element.textAlign ?? 'center')
      setVerticalAlign(element.verticalAlign ?? 'middle')
      setPosX(Math.round(element.x))
      setPosY(Math.round(element.y))
      setSizeW(Math.round(element.width))
      setSizeH(Math.round(element.height))
    } else if (isLine(element)) {
      setFill('')
      setStroke(element.stroke)
      setStrokeWidth(String(element.strokeWidth))
      setLineType(element.lineType)
      setStrokeStyle(element.strokeStyle || 'solid')
      setOpacity(element.opacity ?? 100)
      setConnectorLabel(element.label || '')
      setArrowStartStyle(element.arrowStartStyle || 'none')
      setArrowEndStyle(element.arrowEndStyle || 'triangle')
    } else if (isText(element)) {
      setFill(element.fill)
      setStroke(element.stroke)
      setStrokeWidth(String(element.strokeWidth))
      setFontSize(element.fontSize)
      setFontFamily(element.fontFamily)
      setTextAlign(element.textAlign)
      setOpacity(element.opacity ?? 100)
      setPosX(Math.round(element.x))
      setPosY(Math.round(element.y))
      setSizeW(Math.round(element.width))
      setSizeH(Math.round(element.height))
    }
  }, [element])

  const applyToAll = useCallback((updates: Record<string, unknown>) => {
    for (const el of elements) {
      onUpdate(el.id, updates)
    }
  }, [elements, onUpdate])

  const handleFillChange = useCallback((color: string) => {
    setFill(color)
    onRecentColorAdd(color)
    applyToAll({ fill: color === 'transparent' ? 'none' : color })
  }, [applyToAll, onRecentColorAdd])

  const handleStrokeChange = useCallback((color: string) => {
    setStroke(color)
    onRecentColorAdd(color)
    applyToAll({ stroke: color })
  }, [applyToAll, onRecentColorAdd])

  if (!element) return null

  const showFill = isShape(element) || isText(element)
  const showLineType = isLine(element)
  const showShapeProps = isShape(element)
  const showTextProps = isShape(element) || isText(element)
  const showConnectorProps = isLine(element)

  return (
    <div className="property-panel" data-testid="property-panel">
      {/* Position & Size */}
      {showShapeProps && !isMulti && (
        <div className="property-panel__row">
          <label className="property-panel__field property-panel__field--small">
            <span className="property-panel__label">X</span>
            <input
              data-testid="pos-x"
              type="text"
              value={posX}
              onChange={(e) => setPosX(Number(e.target.value))}
              onBlur={() => applyToAll({ x: posX })}
              onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ x: posX }) }}
            />
          </label>
          <label className="property-panel__field property-panel__field--small">
            <span className="property-panel__label">Y</span>
            <input
              data-testid="pos-y"
              type="text"
              value={posY}
              onChange={(e) => setPosY(Number(e.target.value))}
              onBlur={() => applyToAll({ y: posY })}
              onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ y: posY }) }}
            />
          </label>
          <label className="property-panel__field property-panel__field--small">
            <span className="property-panel__label">W</span>
            <input
              data-testid="size-w"
              type="text"
              value={sizeW}
              onChange={(e) => setSizeW(Number(e.target.value))}
              onBlur={() => applyToAll({ width: sizeW })}
              onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ width: sizeW }) }}
            />
          </label>
          <label className="property-panel__field property-panel__field--small">
            <span className="property-panel__label">H</span>
            <input
              data-testid="size-h"
              type="text"
              value={sizeH}
              onChange={(e) => setSizeH(Number(e.target.value))}
              onBlur={() => applyToAll({ height: sizeH })}
              onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ height: sizeH }) }}
            />
          </label>
        </div>
      )}

      {/* Fill color */}
      {showFill && (
        <label className="property-panel__field">
          <span className="property-panel__label">Fill</span>
          <ColorPicker
            value={fill}
            onChange={handleFillChange}
            pickerClass="color-picker--fill"
            recentColors={recentColors}
            testId="prop-fill"
          />
        </label>
      )}

      {/* Stroke color */}
      <label className="property-panel__field">
        <span className="property-panel__label">Stroke</span>
        <ColorPicker
          value={stroke}
          onChange={handleStrokeChange}
          pickerClass="color-picker--stroke"
          recentColors={recentColors}
          testId="prop-stroke"
        />
      </label>

      {/* Stroke width */}
      <label className="property-panel__field">
        <span className="property-panel__label">Width</span>
        <input
          data-testid="prop-stroke-width"
          type="text"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(e.target.value)}
          onBlur={() => {
            const val = parseFloat(strokeWidth)
            if (!isNaN(val) && val > 0) applyToAll({ strokeWidth: val })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = parseFloat(strokeWidth)
              if (!isNaN(val) && val > 0) applyToAll({ strokeWidth: val })
            }
          }}
        />
      </label>

      {/* Stroke width presets */}
      <div className="property-panel__field">
        <span className="property-panel__label">Presets</span>
        <div className="property-panel__presets">
          <button data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('1'); applyToAll({ strokeWidth: 1 }) }}>Thin</button>
          <button data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('2'); applyToAll({ strokeWidth: 2 }) }}>Medium</button>
          <button data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('4'); applyToAll({ strokeWidth: 4 }) }}>Bold</button>
        </div>
      </div>

      {/* Stroke style */}
      <label className="property-panel__field">
        <span className="property-panel__label">Style</span>
        <select
          data-testid="stroke-style"
          value={strokeStyle}
          onChange={(e) => {
            const val = e.target.value as StrokeStyle
            setStrokeStyle(val)
            applyToAll({ strokeStyle: val })
          }}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>

      {/* Opacity */}
      <label className="property-panel__field">
        <span className="property-panel__label">Opacity</span>
        <input
          data-testid="opacity"
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => {
            const val = Number(e.target.value)
            setOpacity(val)
            applyToAll({ opacity: val })
          }}
        />
      </label>

      {/* Corner radius (shapes only) */}
      {showShapeProps && (
        <label className="property-panel__field">
          <span className="property-panel__label">Radius</span>
          <input
            data-testid="corner-radius"
            type="text"
            value={cornerRadius}
            onChange={(e) => setCornerRadius(Number(e.target.value))}
            onBlur={() => applyToAll({ cornerRadius })}
            onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ cornerRadius }) }}
          />
        </label>
      )}

      {/* Shadow toggle */}
      {showShapeProps && (
        <div className="property-panel__field">
          <button
            data-testid="shadow-toggle"
            className={`property-panel__toggle ${shadow ? 'property-panel__toggle--active' : ''}`}
            onClick={() => {
              const next = !shadow
              setShadow(next)
              applyToAll({ shadow: next })
            }}
          >
            Shadow
          </button>
        </div>
      )}

      {/* Rotation */}
      {showShapeProps && !isMulti && (
        <label className="property-panel__field">
          <span className="property-panel__label">Rotation</span>
          <input
            data-testid="rotation"
            type="text"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            onBlur={() => applyToAll({ rotation })}
            onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ rotation }) }}
          />
        </label>
      )}

      {/* Flip buttons */}
      {showShapeProps && !isMulti && (
        <div className="property-panel__field">
          <span className="property-panel__label">Flip</span>
          <div className="property-panel__row">
            <button
              data-testid="flip-h"
              onClick={() => {
                const el = element as ShapeElement
                applyToAll({ flipH: !el.flipH })
              }}
            >H</button>
            <button
              data-testid="flip-v"
              onClick={() => {
                const el = element as ShapeElement
                applyToAll({ flipV: !el.flipV })
              }}
            >V</button>
          </div>
        </div>
      )}

      {/* Text formatting */}
      {showTextProps && (
        <>
          <label className="property-panel__field">
            <span className="property-panel__label">Font</span>
            <select
              data-testid="font-family"
              value={fontFamily}
              onChange={(e) => {
                setFontFamily(e.target.value)
                applyToAll({ fontFamily: e.target.value })
              }}
            >
              <option value="sans-serif">Sans-serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
            </select>
          </label>
          <label className="property-panel__field">
            <span className="property-panel__label">Size</span>
            <input
              data-testid="font-size"
              type="text"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              onBlur={() => applyToAll({ fontSize })}
              onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ fontSize }) }}
            />
          </label>
          <div className="property-panel__field">
            <span className="property-panel__label">Align</span>
            <div className="property-panel__row">
              <button data-testid="text-align-left" className={textAlign === 'left' ? 'active' : ''} onClick={() => { setTextAlign('left'); applyToAll({ textAlign: 'left' }) }}>L</button>
              <button data-testid="text-align-center" className={textAlign === 'center' ? 'active' : ''} onClick={() => { setTextAlign('center'); applyToAll({ textAlign: 'center' }) }}>C</button>
              <button data-testid="text-align-right" className={textAlign === 'right' ? 'active' : ''} onClick={() => { setTextAlign('right'); applyToAll({ textAlign: 'right' }) }}>R</button>
            </div>
          </div>
          <div className="property-panel__field">
            <span className="property-panel__label">V-Align</span>
            <div className="property-panel__row">
              <button data-testid="valign-top" className={verticalAlign === 'top' ? 'active' : ''} onClick={() => { setVerticalAlign('top'); applyToAll({ verticalAlign: 'top' }) }}>T</button>
              <button data-testid="valign-middle" className={verticalAlign === 'middle' ? 'active' : ''} onClick={() => { setVerticalAlign('middle'); applyToAll({ verticalAlign: 'middle' }) }}>M</button>
              <button data-testid="valign-bottom" className={verticalAlign === 'bottom' ? 'active' : ''} onClick={() => { setVerticalAlign('bottom'); applyToAll({ verticalAlign: 'bottom' }) }}>B</button>
            </div>
          </div>
        </>
      )}

      {/* Line type selector */}
      {showLineType && (
        <label className="property-panel__field">
          <span className="property-panel__label">Line Type</span>
          <select
            data-testid="prop-line-type"
            value={lineType}
            onChange={(e) => {
              const val = e.target.value as LineType
              setLineType(val)
              applyToAll({ lineType: val })
            }}
          >
            <option value="straight">Straight</option>
            <option value="elbow">Elbow</option>
            <option value="curve">Curve</option>
          </select>
        </label>
      )}

      {/* Arrowhead style pickers */}
      {showConnectorProps && (
        <>
          <label className="property-panel__field">
            <span className="property-panel__label">Start Arrow</span>
            <select
              data-testid="arrowhead-start"
              value={arrowStartStyle}
              onChange={(e) => {
                const val = e.target.value as ArrowheadStyle
                setArrowStartStyle(val)
                applyToAll({ arrowStartStyle: val, arrowStart: val !== 'none' ? 1 : 0 })
              }}
            >
              <option value="none">None</option>
              <option value="triangle">Triangle</option>
              <option value="open">Open</option>
              <option value="diamond">Diamond</option>
              <option value="circle">Circle</option>
            </select>
          </label>
          <label className="property-panel__field">
            <span className="property-panel__label">End Arrow</span>
            <select
              data-testid="arrowhead-end"
              value={arrowEndStyle}
              onChange={(e) => {
                const val = e.target.value as ArrowheadStyle
                setArrowEndStyle(val)
                applyToAll({ arrowEndStyle: val, arrowEnd: val !== 'none' ? 1 : 0 })
              }}
            >
              <option value="none">None</option>
              <option value="triangle">Triangle</option>
              <option value="open">Open</option>
              <option value="diamond">Diamond</option>
              <option value="circle">Circle</option>
            </select>
          </label>
        </>
      )}

      {/* Connector label */}
      {showConnectorProps && (
        <label className="property-panel__field">
          <span className="property-panel__label">Label</span>
          <input
            data-testid="connector-label"
            type="text"
            value={connectorLabel}
            onChange={(e) => setConnectorLabel(e.target.value)}
            onBlur={() => applyToAll({ label: connectorLabel })}
            onKeyDown={(e) => { if (e.key === 'Enter') applyToAll({ label: connectorLabel }) }}
          />
        </label>
      )}
    </div>
  )
}
