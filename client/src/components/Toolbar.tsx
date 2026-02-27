import type { Tool } from '../App'

interface Props {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
  noteColor: string
  onColorChange: (color: string) => void
  colors: string[]
}

export function Toolbar({ activeTool, onToolChange, noteColor, onColorChange, colors }: Props) {
  return (
    <div className="toolbar">
      <button
        className={`toolbar__btn ${activeTool === 'select' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select & pan (V)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        </svg>
      </button>

      <button
        className={`toolbar__btn ${activeTool === 'note' ? 'toolbar__btn--active' : ''}`}
        onClick={() => onToolChange('note')}
        title="Add sticky note (N)"
        style={{ position: 'relative' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      </button>

      {activeTool === 'note' && (
        <div className="toolbar__colors">
          {colors.map((c) => (
            <button
              key={c}
              className={`toolbar__color ${c === noteColor ? 'toolbar__color--active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
