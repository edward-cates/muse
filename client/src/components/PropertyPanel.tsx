import { useState, useEffect, useCallback } from 'react'
import { isShape, isLine, isText } from '../types'
import type { CanvasElement, ShapeElement, LineElement, TextElement, LineType, StrokeStyle, ArrowheadStyle } from '../types'

const PRESET_COLORS = [
  // Row 1: Saturated strokes (bold, confident)
  '#1d1d1d', '#4465e9', '#099268', '#e03131', '#e16919', '#ae3ec9', '#f1ac4b', '#9fa8b2',
  // Row 2: Light tinted fills (pair with row 1)
  '#e8e8e8', '#dce1f8', '#d3e9e3', '#f4dadb', '#f8e2d4', '#ecdcf2', '#f9f0e6', '#eceef0',
  // Row 3: Medium tones
  '#4ba1f1', '#4cb05e', '#f87777', '#e085f4', '#0891b2', '#ca8a04', '#db2777', '#475569',
  // Row 4: Coordinated light fills
  '#ddedfa', '#dbf0e0', '#fde8e8', '#f5eafa', '#ecfeff', '#fefce8', '#fdf2f8', '#f8fafc',
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
      <div className="color-picker__hex-row">
        <input
          className="color-picker__hex-input"
          type="text"
          data-testid={testId}
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={() => onChange(hexInput)}
          onKeyDown={(e) => { if (e.key === 'Enter') onChange(hexInput) }}
        />
        <input
          className="color-picker__native"
          type="color"
          value={value === 'transparent' ? '#ffffff' : value}
          onChange={(e) => onChange(e.target.value)}
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
  const [cornerRadius, setCornerRadius] = useState(8)
  const [shadow, setShadow] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [fontSize, setFontSize] = useState(18)
  const [fontFamily, setFontFamily] = useState('Inter, system-ui, sans-serif')
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
      setCornerRadius(element.cornerRadius ?? 8)
      setShadow(element.shadow ?? true)
      setRotation(element.rotation ?? 0)
      setFontSize(element.fontSize ?? 18)
      setFontFamily(element.fontFamily ?? 'Inter, system-ui, sans-serif')
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
      setVerticalAlign(element.verticalAlign ?? 'top')
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
        <div className="property-panel__row">
          <button className={`property-panel__btn property-panel__btn--wide ${strokeWidth === '1.5' ? 'property-panel__btn--active' : ''}`} data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('1.5'); applyToAll({ strokeWidth: 1.5 }) }}>Thin</button>
          <button className={`property-panel__btn property-panel__btn--wide ${strokeWidth === '2.5' ? 'property-panel__btn--active' : ''}`} data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('2.5'); applyToAll({ strokeWidth: 2.5 }) }}>Medium</button>
          <button className={`property-panel__btn property-panel__btn--wide ${strokeWidth === '5' ? 'property-panel__btn--active' : ''}`} data-testid="stroke-width-preset" onClick={() => { setStrokeWidth('5'); applyToAll({ strokeWidth: 5 }) }}>Bold</button>
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
            className={`property-panel__btn property-panel__btn--wide ${shadow ? 'property-panel__btn--active' : ''}`}
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
              className="property-panel__btn"
              data-testid="flip-h"
              onClick={() => {
                const el = element as ShapeElement
                applyToAll({ flipH: !el.flipH })
              }}
            >H</button>
            <button
              className="property-panel__btn"
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
              <option value="Inter, system-ui, sans-serif">Inter</option>
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
              <button data-testid="text-align-left" className={`property-panel__btn ${textAlign === 'left' ? 'property-panel__btn--active' : ''}`} onClick={() => { setTextAlign('left'); applyToAll({ textAlign: 'left' }) }}>L</button>
              <button data-testid="text-align-center" className={`property-panel__btn ${textAlign === 'center' ? 'property-panel__btn--active' : ''}`} onClick={() => { setTextAlign('center'); applyToAll({ textAlign: 'center' }) }}>C</button>
              <button data-testid="text-align-right" className={`property-panel__btn ${textAlign === 'right' ? 'property-panel__btn--active' : ''}`} onClick={() => { setTextAlign('right'); applyToAll({ textAlign: 'right' }) }}>R</button>
            </div>
          </div>
          <div className="property-panel__field">
            <span className="property-panel__label">V-Align</span>
            <div className="property-panel__row">
              <button data-testid="valign-top" className={`property-panel__btn ${verticalAlign === 'top' ? 'property-panel__btn--active' : ''}`} onClick={() => { setVerticalAlign('top'); applyToAll({ verticalAlign: 'top' }) }}>T</button>
              <button data-testid="valign-middle" className={`property-panel__btn ${verticalAlign === 'middle' ? 'property-panel__btn--active' : ''}`} onClick={() => { setVerticalAlign('middle'); applyToAll({ verticalAlign: 'middle' }) }}>M</button>
              <button data-testid="valign-bottom" className={`property-panel__btn ${verticalAlign === 'bottom' ? 'property-panel__btn--active' : ''}`} onClick={() => { setVerticalAlign('bottom'); applyToAll({ verticalAlign: 'bottom' }) }}>B</button>
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
