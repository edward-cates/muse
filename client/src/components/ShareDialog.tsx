import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Share {
  id: string
  email: string
  created_at: string
}

interface ShareDialogProps {
  documentId: string
  onClose: () => void
}

export function ShareDialog({ documentId, onClose }: ShareDialogProps) {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hoveredShareId, setHoveredShareId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchShares = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/shares`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setShares(data.shares)
      } else if (res.status === 403) {
        setError('You do not have permission to share this document.')
      }
    } catch {
      setError('Failed to load shares.')
    } finally {
      setLoading(false)
    }
  }, [documentId, session?.access_token])

  useEffect(() => {
    fetchShares()
  }, [fetchShares])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !session?.access_token) return

    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/documents/${documentId}/shares`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      })

      if (res.ok) {
        const data = await res.json()
        setShares(prev => [...prev, data.share])
        setEmail('')
        setSuccess(`Shared with ${trimmed}`)
        setTimeout(() => setSuccess(null), 3000)
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error || `Failed to share (${res.status})`)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (shareId: string) => {
    if (!session?.access_token) return

    try {
      const res = await fetch(`/api/documents/${documentId}/shares/${shareId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        setShares(prev => prev.filter(s => s.id !== shareId))
      } else {
        setError('Failed to remove share.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div style={styles.overlay} onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <div ref={dialogRef} style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Share document</span>
          <button
            onClick={onClose}
            style={styles.closeBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text, #333)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted, #666)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Email input form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            disabled={submitting}
            style={styles.input}
          />
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            style={{
              ...styles.shareBtn,
              ...(submitting || !email.trim() ? styles.shareBtnDisabled : {}),
            }}
          >
            {submitting ? 'Sharing...' : 'Share'}
          </button>
        </form>

        {/* Status messages */}
        {error && (
          <div style={styles.errorMsg}>{error}</div>
        )}
        {success && (
          <div style={styles.successMsg}>{success}</div>
        )}

        {/* Share list */}
        <div style={styles.listSection}>
          <span style={styles.listTitle}>People with access</span>
          <div style={styles.list}>
            {loading && (
              <div style={styles.emptyState}>Loading...</div>
            )}
            {!loading && shares.length === 0 && (
              <div style={styles.emptyState}>Not shared with anyone yet.</div>
            )}
            {shares.map((share) => (
              <div
                key={share.id}
                style={{
                  ...styles.shareRow,
                  ...(hoveredShareId === share.id ? styles.shareRowHover : {}),
                }}
                onMouseEnter={() => setHoveredShareId(share.id)}
                onMouseLeave={() => setHoveredShareId(null)}
              >
                <div style={styles.shareAvatar}>
                  {share.email[0].toUpperCase()}
                </div>
                <span style={styles.shareEmail}>{share.email}</span>
                <button
                  onClick={() => handleRemove(share.id)}
                  style={{
                    ...styles.removeBtn,
                    opacity: hoveredShareId === share.id ? 1 : 0,
                  }}
                  title="Remove access"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fee2e2'
                    e.currentTarget.style.color = '#dc2626'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-muted, #666)'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    width: 440,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface, #fff)',
    borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text, #333)',
    letterSpacing: '-0.01em',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    background: 'none',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'var(--text-muted, #666)',
    fontFamily: 'inherit',
    transition: 'color 0.12s',
  },
  form: {
    display: 'flex',
    gap: 8,
    padding: '0 20px 16px',
  },
  input: {
    flex: 1,
    padding: '9px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    outline: 'none',
    color: 'var(--text, #333)',
    background: 'var(--surface, #fff)',
  },
  shareBtn: {
    padding: '9px 18px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 600,
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.12s',
  },
  shareBtnDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  errorMsg: {
    padding: '8px 20px',
    fontSize: 13,
    color: '#dc2626',
    background: '#fef2f2',
    borderTop: '1px solid #fecaca',
    borderBottom: '1px solid #fecaca',
  },
  successMsg: {
    padding: '8px 20px',
    fontSize: 13,
    color: '#16a34a',
    background: '#f0fdf4',
    borderTop: '1px solid #bbf7d0',
    borderBottom: '1px solid #bbf7d0',
  },
  listSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    borderTop: '1px solid var(--border, #e0e0e0)',
  },
  listTitle: {
    padding: '12px 20px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted, #666)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 12px 12px',
  },
  emptyState: {
    padding: '20px 8px',
    fontSize: 13,
    color: 'var(--text-muted, #888)',
    textAlign: 'center',
  },
  shareRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 8px',
    borderRadius: 8,
    transition: 'background 0.12s',
  },
  shareRowHover: {
    background: 'rgba(0, 0, 0, 0.03)',
  },
  shareAvatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: 'var(--accent-light, #eef)',
    color: 'var(--accent, #4465e9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  shareEmail: {
    flex: 1,
    fontSize: 13,
    color: 'var(--text, #333)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'var(--text-muted, #666)',
    fontFamily: 'inherit',
    transition: 'opacity 0.12s, background 0.12s, color 0.12s',
    flexShrink: 0,
  },
}
