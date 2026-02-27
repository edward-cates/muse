import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { CollabProvider } from './collab/CollabContext'
import { useDrawingId } from './hooks/useDrawingId'
import './index.css'

function Root() {
  const { session, loading } = useAuth()

  if (loading) return null

  if (!session) return <LoginPage />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const drawingId = useDrawingId()
  return (
    <CollabProvider roomName={`muse-${drawingId}`}>
      <App />
    </CollabProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
