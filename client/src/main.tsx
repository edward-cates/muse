import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { CollabProvider } from './collab/CollabContext'
import { useDrawingId } from './hooks/useDrawingId'
import './index.css'

function Root() {
  const drawingId = useDrawingId()
  return (
    <CollabProvider roomName={`muse-${drawingId}`}>
      <App />
    </CollabProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
