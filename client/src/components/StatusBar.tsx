import { useConnection } from '../hooks/useConnection'

export function StatusBar() {
  const status = useConnection()

  return (
    <div className="statusbar">
      <span className={`statusbar__dot statusbar__dot--${status}`} />
      <span className="statusbar__text">
        {status === 'connected' && 'Connected'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && 'Offline'}
      </span>
    </div>
  )
}
