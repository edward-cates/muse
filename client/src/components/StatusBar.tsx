import { useConnection } from '../hooks/useConnection'

interface Props {
  onSettingsClick: () => void
  onAiClick: () => void
  onToggleMinimap?: () => void
  onToggleDarkMode?: () => void
}

export function StatusBar({ onSettingsClick, onAiClick, onToggleMinimap, onToggleDarkMode }: Props) {
  const status = useConnection()

  return (
    <div className="statusbar">
      <span className={`statusbar__dot statusbar__dot--${status}`} />
      <span className="statusbar__text">
        {status === 'connected' && 'Connected'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && 'Offline'}
      </span>
      <span className="statusbar__divider" />
      <button className="statusbar__btn" onClick={onAiClick} title="AI">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
          <path d="M6 10v2a6 6 0 0 0 12 0v-2" />
          <path d="M12 18v4" />
          <path d="M8 22h8" />
        </svg>
      </button>
      {onToggleMinimap && (
        <button className="statusbar__btn" data-testid="toggle-minimap" onClick={onToggleMinimap} title="Minimap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
        </button>
      )}
      {onToggleDarkMode && (
        <button className="statusbar__btn" data-testid="toggle-dark-mode" onClick={onToggleDarkMode} title="Dark Mode">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      )}
      <button className="statusbar__btn" onClick={onSettingsClick} title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
