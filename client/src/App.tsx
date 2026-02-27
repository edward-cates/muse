import { useState } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'

export type Tool = 'select' | 'note'

const NOTE_COLORS = ['#fef08a', '#fda4af', '#93c5fd', '#86efac', '#c4b5fd', '#fdba74']

export function App() {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0])

  return (
    <div className="app">
      <Canvas activeTool={activeTool} noteColor={noteColor} onNotePlaced={() => setActiveTool('select')} />
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        noteColor={noteColor}
        onColorChange={setNoteColor}
        colors={NOTE_COLORS}
      />
      <StatusBar />
    </div>
  )
}
