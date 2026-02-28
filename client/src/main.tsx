import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

async function boot() {
  const root = createRoot(document.getElementById('root')!)

  if (import.meta.env.VITE_E2E === 'true') {
    const { TestRoot } = await import('./testing/TestRoot')
    root.render(
      <StrictMode>
        <TestRoot />
      </StrictMode>,
    )
  } else {
    const { App } = await import('./App')
    const { AuthProvider, useAuth } = await import('./auth/AuthContext')
    const { LoginPage } = await import('./auth/LoginPage')
    const { CollabProvider } = await import('./collab/CollabContext')
    const { useDrawingId } = await import('./hooks/useDrawingId')
    const { useDrawingRegistration } = await import('./hooks/useDrawingRegistration')

    function Root() {
      const { session, loading } = useAuth()
      if (loading) return null
      if (!session) return <LoginPage />
      return <AuthenticatedApp />
    }

    function AuthenticatedApp() {
      const drawingId = useDrawingId()
      useDrawingRegistration(drawingId)
      return (
        <CollabProvider roomName={`muse-${drawingId}`}>
          <App drawingId={drawingId} />
        </CollabProvider>
      )
    }

    root.render(
      <StrictMode>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </StrictMode>,
    )
  }
}

boot()
