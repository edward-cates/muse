import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Drawing {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface Props {
  currentDrawingId: string
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function DrawingsList({ currentDrawingId }: Props) {
  const { session } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [loading, setLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchDrawings = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch('/api/drawings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDrawings(data.drawings)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (expanded) fetchDrawings()
  }, [expanded, fetchDrawings])

  // Close on click outside
  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  const handleNavigate = (id: string) => {
    if (id === currentDrawingId) {
      setExpanded(false)
      return
    }
    window.location.hash = `/d/${id}`
    setExpanded(false)
  }

  const handleNewDrawing = () => {
    const newId = crypto.randomUUID()
    window.location.hash = `/d/${newId}`
    setExpanded(false)
  }

  return (
    <div ref={panelRef} style={s.container}>
      {/* Expandable panel */}
      <div
        style={{
          ...s.panel,
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)',
          pointerEvents: expanded ? 'auto' : 'none',
        }}
      >
        <div style={s.panelHeader}>
          <span style={s.panelTitle}>Drawings</span>
          <button
            style={s.newBtn}
            onClick={handleNewDrawing}
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, { background: 'var(--accent)', color: '#fff' })
            }}
            onMouseLeave={(e) => {
              Object.assign(e.currentTarget.style, { background: 'var(--accent-light)', color: 'var(--accent)' })
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>New</span>
          </button>
        </div>

        <div style={s.list}>
          {loading && drawings.length === 0 && (
            <div style={s.emptyState}>
              <div style={s.loadingDot} />
              <span>Loading...</span>
            </div>
          )}
          {!loading && drawings.length === 0 && (
            <div style={s.emptyState}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span style={{ marginTop: 8 }}>No drawings yet</span>
            </div>
          )}
          {drawings.map((d) => {
            const isActive = d.id === currentDrawingId
            const isHovered = hoveredId === d.id
            return (
              <button
                key={d.id}
                onClick={() => handleNavigate(d.id)}
                onMouseEnter={() => setHoveredId(d.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...s.item,
                  ...(isActive ? s.itemActive : {}),
                  ...(isHovered && !isActive ? s.itemHover : {}),
                }}
              >
                <div style={s.itemIcon}>
                  {isActive ? (
                    <div style={s.activeDot} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <path d="M3 9h18" />
                    </svg>
                  )}
                </div>
                <div style={s.itemContent}>
                  <span style={{
                    ...s.itemTitle,
                    ...(isActive ? { color: 'var(--accent)', fontWeight: 600 } : {}),
                  }}>
                    {d.title}
                  </span>
                  <span style={s.itemTime}>{timeAgo(d.updated_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Trigger button */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          ...s.trigger,
          ...(expanded ? s.triggerActive : {}),
        }}
        onMouseEnter={(e) => {
          if (!expanded) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)'
            e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.12)'
          }
        }}
        onMouseLeave={(e) => {
          if (!expanded) {
            e.currentTarget.style.background = 'var(--surface)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }
        }}
        title="Drawings"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        {drawings.length > 0 && (
          <span style={s.triggerCount}>{drawings.length}</span>
        )}
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 20,
    left: 20,
    zIndex: 500,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },

  // Panel
  panel: {
    width: 280,
    maxHeight: 420,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(255, 255, 255, 0.88)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
    overflow: 'hidden',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    transformOrigin: 'bottom left',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: '1px solid var(--border)',
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.01em',
  },
  newBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: 'var(--accent)',
    background: 'var(--accent-light)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },

  // List
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--text-muted)',
    marginBottom: 8,
    animation: 'pulse 1.2s ease infinite',
  },

  // Item
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 10px',
    background: 'none',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background 0.12s',
  },
  itemHover: {
    background: 'rgba(0, 0, 0, 0.03)',
  },
  itemActive: {
    background: 'var(--accent-light)',
  },
  itemIcon: {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--text-muted)',
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemTime: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },

  // Trigger
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'var(--surface)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 20,
    cursor: 'pointer',
    color: 'var(--text-muted)',
    boxShadow: 'var(--shadow)',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  },
  triggerActive: {
    background: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(0, 0, 0, 0.12)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-lg)',
  },
  triggerCount: {
    fontSize: 11,
    fontWeight: 600,
    color: 'inherit',
    opacity: 0.7,
  },
}
