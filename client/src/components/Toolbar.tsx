import type { Tool, LineType } from '../types'

interface Props {
  activeTool: Tool
  activeLineType: LineType
  onToolChange: (tool: Tool) => void
  onLineTypeChange: (lineType: LineType) => void
}

const LINE_TOOLS: Tool[] = ['line', 'arrow']

export function Toolbar({ activeTool, activeLineType, onToolChange, onLineTypeChange }: Props) {
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

      {/* Line type sub-selector — visible when line or arrow tool is active */}
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
