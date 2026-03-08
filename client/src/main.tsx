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
    const { AuthProvider, useAuth } = await import('./auth/AuthContext')
    const { LoginPage } = await import('./auth/LoginPage')
    const { DocumentShell } = await import('./DocumentShell')
    const { ActiveCanvasProvider } = await import('./ai/ActiveCanvasContext')
    const { AiPanel } = await import('./components/AiPanel')

    function Root() {
      const { session, loading } = useAuth()
      if (loading) return null
      if (!session) return <LoginPage />
      return (
        <ActiveCanvasProvider>
          <div className="app-shell">
            <DocumentShell />
            <AiPanel />
          </div>
        </ActiveCanvasProvider>
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
