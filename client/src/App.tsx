import { useState, useEffect, useCallback } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { AiPanel } from './components/AiPanel'
import { DrawingsList } from './components/DrawingsList'
import { useElements } from './hooks/useElements'
import type { Tool } from './types'

export function App({ drawingId }: { drawingId: string }) {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const { elements, addShape, addPath, addLine, updateElement, deleteElement } = useElements()

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
        case 'l':
          setActiveTool('line')
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
        elements={elements}
        addShape={addShape}
        addPath={addPath}
        addLine={addLine}
        updateElement={updateElement}
        deleteElement={deleteElement}
      />
      <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />
      <StatusBar
        onSettingsClick={() => setSettingsOpen(true)}
        onAiClick={() => setAiOpen(true)}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        elements={elements}
        elementActions={{ addShape, addLine, updateElement, deleteElement }}
      />
      <DrawingsList currentDrawingId={drawingId} />
    </div>
  )
}
