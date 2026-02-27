import { useState, useEffect, useCallback } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import type { Tool } from './types'

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const switchToSelect = useCallback(() => setActiveTool('select'), [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in a textarea/input
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return

      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select')
          break
        case 'r':
          setActiveTool('rectangle')
          setSelectedId(null)
          break
        case 'o':
          setActiveTool('ellipse')
          setSelectedId(null)
          break
        case 'd':
          setActiveTool('diamond')
          setSelectedId(null)
          break
        case 'p':
          setActiveTool('draw')
          setSelectedId(null)
          break
        case 'escape':
          setActiveTool('select')
          setSelectedId(null)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app">
      <Canvas
        activeTool={activeTool}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        onToolChange={setActiveTool}
        onShapeCreated={switchToSelect}
      />
      <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />
      <StatusBar />
    </div>
  )
}
