import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: Props) {
  const { session, signOut } = useAuth()
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = session?.access_token

  useEffect(() => {
    if (!open || !token) return
    fetch('/api/keys/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setHasKey(d.hasKey))
      .catch(() => {})
  }, [open, token])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !apiKey.trim()) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: apiKey.trim() }),
      })
      if (!res.ok) {
        const text = await res.text()
        let message = 'Failed to save'
        try { message = JSON.parse(text).error || message } catch {}
        throw new Error(message)
      }
      setApiKey('')
      setHasKey(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!token) return
    try {
      await fetch('/api/keys', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setHasKey(false)
    } catch {
      setError('Failed to delete key')
    }
  }

  if (!open) return null

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Settings</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Anthropic API Key</h3>
          {hasKey ? (
            <div style={styles.keyStatus}>
              <span style={styles.keyDot} />
              <span>Key saved</span>
              <button onClick={handleDelete} style={styles.deleteBtn}>Remove</button>
            </div>
          ) : (
            <p style={styles.hint}>Required for AI features</p>
          )}
          <form onSubmit={handleSave} style={styles.form}>
            <input
              type="password"
              placeholder={hasKey ? 'Replace existing key...' : 'sk-ant-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={saving || !apiKey.trim()} style={styles.saveBtn}>
              {saving ? '...' : 'Save'}
            </button>
          </form>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Account</h3>
          <p style={styles.email}>{session?.user?.email}</p>
          <button onClick={signOut} style={styles.signOutBtn}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    width: 400,
    maxHeight: '80vh',
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
    overflow: 'auto',
    padding: 28,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    padding: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 8,
  },
  keyStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#111',
    marginBottom: 8,
  },
  keyDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#4ade80',
  },
  deleteBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#ef4444',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  form: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 8,
    outline: 'none',
    fontFamily: 'inherit',
  },
  saveBtn: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 6,
  },
  email: {
    fontSize: 14,
    color: '#111',
    marginBottom: 8,
  },
  signOutBtn: {
    padding: '8px 16px',
    fontSize: 14,
    background: 'none',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#111',
    fontFamily: 'inherit',
  },
}
