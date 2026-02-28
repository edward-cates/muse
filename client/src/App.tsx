import { useState, useEffect, useCallback } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { AiPanel } from './components/AiPanel'
import { DrawingsList } from './components/DrawingsList'
import { DrawingTitle } from './components/DrawingTitle'
import { useElements } from './hooks/useElements'
import type { Tool, LineType } from './types'

export function App({ drawingId }: { drawingId: string }) {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [activeLineType, setActiveLineType] = useState<LineType>('straight')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const { elements, addShape, addPath, addLine, addArrow, updateElement, deleteElement } = useElements()

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
          setSelectedIds([])
          break
        case 'o':
          setActiveTool('ellipse')
          setSelectedIds([])
          break
        case 'd':
          setActiveTool('diamond')
          setSelectedIds([])
          break
        case 'p':
          setActiveTool('draw')
          setSelectedIds([])
          break
        case 'l':
          setActiveTool('line')
          setSelectedIds([])
          break
        case 'a':
          setActiveTool('arrow')
          setSelectedIds([])
          break
        case 'escape':
          setActiveTool('select')
          setSelectedIds([])
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
        activeLineType={activeLineType}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onToolChange={setActiveTool}
        onShapeCreated={switchToSelect}
        elements={elements}
        addShape={addShape}
        addPath={addPath}
        addLine={addLine}
        addArrow={addArrow}
        updateElement={updateElement}
        deleteElement={deleteElement}
      />
      <Toolbar activeTool={activeTool} activeLineType={activeLineType} onToolChange={setActiveTool} onLineTypeChange={setActiveLineType} />
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
      <DrawingTitle drawingId={drawingId} />
      <DrawingsList currentDrawingId={drawingId} />
    </div>
  )
}
