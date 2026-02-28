import type { Tool } from '../types'

interface Props {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
}

export function Toolbar({ activeTool, onToolChange }: Props) {
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
    </div>
  )
}
