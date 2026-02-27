import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) setError(error.message)
    setLoading(false)
  }

  const handleGoogle = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) setError(error.message)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Muse</h1>
        <p style={styles.subtitle}>Collaborative drawing</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '...' : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <button onClick={handleGoogle} style={styles.oauthButton}>
          Continue with Google
        </button>

        <p style={styles.toggle}>
          {isSignUp ? 'Have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
            }}
            style={styles.toggleLink}
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ffffff',
    backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
  },
  card: {
    width: 360,
    padding: 40,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 16,
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#111',
    marginBottom: 4,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 28,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  input: {
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 10,
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  error: {
    fontSize: 13,
    color: '#ef4444',
    margin: 0,
  },
  button: {
    padding: '10px 0',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    background: '#111',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  oauthButton: {
    marginTop: 12,
    padding: '10px 0',
    width: '100%',
    fontSize: 14,
    fontWeight: 500,
    color: '#111',
    background: 'none',
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 10,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toggle: {
    marginTop: 20,
    fontSize: 13,
    color: '#6b7280',
  },
  toggleLink: {
    background: 'none',
    border: 'none',
    color: '#111',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
}
