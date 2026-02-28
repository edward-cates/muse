import { useState, useRef } from 'react'
import type { Tool, LineType } from '../types'

interface Props {
  activeTool: Tool
  activeLineType: LineType
  onToolChange: (tool: Tool) => void
  onLineTypeChange: (lineType: LineType) => void
  onInsertImage?: (src: string, w: number, h: number) => void
}

const LINE_TOOLS: Tool[] = ['line', 'arrow']

export function Toolbar({ activeTool, activeLineType, onToolChange, onLineTypeChange, onInsertImage }: Props) {
  const [showShapePicker, setShowShapePicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleInsertImage = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onInsertImage) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        onInsertImage(reader.result as string, img.width || 200, img.height || 200)
      }
      img.onerror = () => {
        onInsertImage(reader.result as string, 200, 200)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = '' // reset
  }

  return (
    <div className="toolbar">
      {/* Select */}
      <button
        data-testid="tool-select"
        className={`toolbar__btn ${activeTool === 'select' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select (V)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      </button>

      {/* Hand */}
      <button
        data-testid="tool-hand"
        className={`toolbar__btn ${activeTool === 'hand' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('hand')}
        title="Hand (H)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 11V6a2 2 0 00-4 0v2M14 8V4a2 2 0 00-4 0v6M10 10V5a2 2 0 00-4 0v9" />
          <path d="M18 11a2 2 0 014 0v3a8 8 0 01-8 8h-2c-2.5 0-5-1.5-7-4l-.7-.7a2 2 0 012.8-2.8L6 15.5V6" />
        </svg>
      </button>

      {/* Rectangle */}
      <button
        data-testid="tool-rectangle"
        className={`toolbar__btn ${activeTool === 'rectangle' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('rectangle')}
        title="Rectangle (R)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </button>

      {/* Ellipse */}
      <button
        data-testid="tool-ellipse"
        className={`toolbar__btn ${activeTool === 'ellipse' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('ellipse')}
        title="Ellipse (O)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="12" rx="10" ry="8" />
        </svg>
      </button>

      {/* Diamond */}
      <button
        data-testid="tool-diamond"
        className={`toolbar__btn ${activeTool === 'diamond' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('diamond')}
        title="Diamond (D)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L22 12L12 22L2 12Z" />
        </svg>
      </button>

      {/* More shapes */}
      <div style={{ position: 'relative' }}>
        <button
          data-testid="more-shapes"
          className="toolbar__btn"
          onClick={() => setShowShapePicker(!showShapePicker)}
          title="More shapes"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
        {showShapePicker && (
          <div className="shape-picker-flyout">
            <button data-testid="tool-triangle" data-shape="triangle" onClick={() => { onToolChange('triangle'); setShowShapePicker(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12,3 22,21 2,21" />
              </svg>
            </button>
            <button data-testid="tool-hexagon" data-shape="hexagon" onClick={() => { onToolChange('hexagon'); setShowShapePicker(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" />
              </svg>
            </button>
            <button data-testid="tool-star" data-shape="star" onClick={() => { onToolChange('star'); setShowShapePicker(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
            </button>
            <button data-testid="tool-cloud" data-shape="cloud" onClick={() => { onToolChange('cloud'); setShowShapePicker(false) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Line */}
      <button
        data-testid="tool-line"
        className={`toolbar__btn ${activeTool === 'line' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('line')}
        title="Line (L)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <polyline points="13 5 19 5 19 11" fill="none" />
        </svg>
      </button>

      {/* Arrow */}
      <button
        data-testid="tool-arrow"
        className={`toolbar__btn ${activeTool === 'arrow' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('arrow')}
        title="Arrow (A)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <polyline points="10 5 19 5 19 14" fill="none" />
        </svg>
      </button>

      {/* Draw */}
      <button
        data-testid="tool-draw"
        className={`toolbar__btn ${activeTool === 'draw' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('draw')}
        title="Draw (P)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17c3.5-3.5 7-2 8.5-3.5C13 12 10 8 14 4c1.5-1.5 4-.5 5 1s.5 4-1 5c-4 4-8 1-8.5 2.5C8 14 11 17.5 7 21" />
        </svg>
      </button>

      {/* Text */}
      <button
        data-testid="tool-text"
        className={`toolbar__btn ${activeTool === 'text' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('text')}
        title="Text (T)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
      </button>

      {/* Frame */}
      <button
        data-testid="tool-frame"
        className={`toolbar__btn ${activeTool === 'frame' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('frame')}
        title="Frame (F)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
        </svg>
      </button>

      {/* Eraser */}
      <button
        data-testid="tool-eraser"
        className={`toolbar__btn ${activeTool === 'eraser' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('eraser')}
        title="Eraser (E)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 20H7L3 16a1 1 0 010-1.4l9.3-9.3a1 1 0 011.4 0l6.3 6.3a1 1 0 010 1.4L16 17" />
        </svg>
      </button>

      {/* Insert image */}
      <button
        data-testid="insert-image"
        className="toolbar__btn"
        onClick={handleInsertImage}
        title="Insert Image"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Line type sub-selector */}
      {LINE_TOOLS.includes(activeTool) && (
        <div className="toolbar__line-types" data-testid="line-type-selector">
          <button
            data-testid="line-type-straight"
            className={`toolbar__line-type-btn ${activeLineType === 'straight' ? 'toolbar__line-type-btn--active' : ''}`}
            onClick={() => onLineTypeChange('straight')}
            title="Straight"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
              <line x1="2" y1="12" x2="12" y2="2" />
            </svg>
          </button>
          <button
            data-testid="line-type-elbow"
            className={`toolbar__line-type-btn ${activeLineType === 'elbow' ? 'toolbar__line-type-btn--active' : ''}`}
            onClick={() => onLineTypeChange('elbow')}
            title="Elbow"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
              <polyline points="2,12 7,12 7,2 12,2" />
            </svg>
          </button>
          <button
            data-testid="line-type-curve"
            className={`toolbar__line-type-btn ${activeLineType === 'curve' ? 'toolbar__line-type-btn--active' : ''}`}
            onClick={() => onLineTypeChange('curve')}
            title="Curve"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M2 12 C 2 6, 12 8, 12 2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
