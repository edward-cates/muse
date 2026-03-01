import { useState, useEffect, useCallback, useRef } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { AiPanel } from './components/AiPanel'
import { DrawingsList } from './components/DrawingsList'
import { DrawingTitle } from './components/DrawingTitle'
import { useElements } from './hooks/useElements'
import type { Tool, LineType, CanvasElement } from './types'
import { isShape, isLine, isText } from './types'

export function App({ drawingId }: { drawingId: string }) {
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [activeLineType, setActiveLineType] = useState<LineType>('straight')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [gridEnabled, setGridEnabled] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [minimapVisible, setMinimapVisible] = useState(false)

  // Clipboard buffer
  const clipboardRef = useRef<CanvasElement[]>([])
  // Style clipboard
  const styleClipboardRef = useRef<Record<string, unknown> | null>(null)

  const {
    elements, addShape, addPath, addLine, addArrow, addText, addImage, addFrame, addWebCard,
    updateElement, deleteElement, undo, redo, stopCapturing,
    reorderElement, groupElements, ungroupElements,
    setLastUsedStyle, doc,
  } = useElements()

  const switchToSelect = useCallback(() => setActiveTool('select'), [])

  // When switching to a non-select tool, clear the selection
  const handleToolChange = useCallback((tool: Tool) => {
    setActiveTool(tool)
    if (tool !== 'select') {
      setSelectedIds([])
    }
  }, [])

  // Capture last-used style when deselecting a shape
  const prevSelectedRef = useRef<string[]>([])
  useEffect(() => {
    const prevIds = prevSelectedRef.current
    prevSelectedRef.current = selectedIds
    // If we had shapes selected before and now we don't (or different selection)
    if (prevIds.length > 0 && selectedIds.length === 0) {
      const prevEl = elements.find(e => e.id === prevIds[0])
      if (prevEl && isShape(prevEl)) {
        setLastUsedStyle(prevEl.fill, prevEl.stroke)
      }
    }
  }, [selectedIds, elements, setLastUsedStyle])

  // Dark mode effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Undo/Redo — always works, even when inputs are focused
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

      // Copy
      if (meta && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        e.preventDefault()
        const selected = elements.filter(el => selectedIds.includes(el.id))
        if (selected.length > 0) {
          const selectedIdSet = new Set(selectedIds)
          const connectors = elements.filter(el =>
            isLine(el) && !selectedIdSet.has(el.id) &&
            selectedIdSet.has(el.startShapeId) && selectedIdSet.has(el.endShapeId)
          )
          clipboardRef.current = [...selected, ...connectors]
        }
        return
      }

      // Cut
      if (meta && e.key.toLowerCase() === 'x') {
        e.preventDefault()
        const selected = elements.filter(el => selectedIds.includes(el.id))
        if (selected.length > 0) {
          const selectedIdSet = new Set(selectedIds)
          const connectors = elements.filter(el =>
            isLine(el) && !selectedIdSet.has(el.id) &&
            selectedIdSet.has(el.startShapeId) && selectedIdSet.has(el.endShapeId)
          )
          clipboardRef.current = [...selected, ...connectors]
          for (const id of selectedIds) {
            deleteElement(id)
          }
          setSelectedIds([])
        }
        return
      }

      // Paste
      if (meta && e.key.toLowerCase() === 'v' && !e.shiftKey) {
        e.preventDefault()
        if (clipboardRef.current.length > 0) {
          const idMap = new Map<string, string>()
          const newIds: string[] = []

          doc.transact(() => {
            for (const el of clipboardRef.current) {
              if (isShape(el)) {
                const id = addShape(el.type, el.x + 20, el.y + 20, el.width, el.height)
                updateElement(id, {
                  text: el.text, fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
                  fontSize: el.fontSize, fontFamily: el.fontFamily, textAlign: el.textAlign,
                  verticalAlign: el.verticalAlign, strokeStyle: el.strokeStyle, opacity: el.opacity,
                  cornerRadius: el.cornerRadius, shadow: el.shadow, rotation: el.rotation,
                })
                idMap.set(el.id, id)
                newIds.push(id)
              } else if (isLine(el)) {
                const startId = el.startShapeId ? (idMap.get(el.startShapeId) || el.startShapeId) : ''
                const endId = el.endShapeId ? (idMap.get(el.endShapeId) || el.endShapeId) : ''
                const id = addArrow(
                  startId, endId,
                  el.startX + 20, el.startY + 20,
                  el.endX + 20, el.endY + 20,
                  el.lineType,
                )
                updateElement(id, { stroke: el.stroke, strokeWidth: el.strokeWidth })
                newIds.push(id)
              } else if (isText(el)) {
                const id = addText(el.x + 20, el.y + 20)
                updateElement(id, { text: el.text, fontSize: el.fontSize, fontFamily: el.fontFamily })
                newIds.push(id)
              }
            }
          })
          stopCapturing()
          setSelectedIds(newIds)
        }
        return
      }

      // Duplicate
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const selected = elements.filter(el => selectedIds.includes(el.id))
        if (selected.length > 0) {
          const selectedIdSet = new Set(selectedIds)
          const connectors = elements.filter(el =>
            isLine(el) && !selectedIdSet.has(el.id) &&
            selectedIdSet.has(el.startShapeId) && selectedIdSet.has(el.endShapeId)
          )
          const toCopy = [...selected, ...connectors]
          const idMap = new Map<string, string>()
          const newIds: string[] = []
          doc.transact(() => {
            for (const el of toCopy) {
              if (isShape(el)) {
                const id = addShape(el.type, el.x + 20, el.y + 20, el.width, el.height)
                updateElement(id, {
                  text: el.text, fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
                })
                idMap.set(el.id, id)
                newIds.push(id)
              } else if (isLine(el)) {
                const startId = el.startShapeId ? (idMap.get(el.startShapeId) || el.startShapeId) : ''
                const endId = el.endShapeId ? (idMap.get(el.endShapeId) || el.endShapeId) : ''
                const id = addArrow(startId, endId, el.startX + 20, el.startY + 20, el.endX + 20, el.endY + 20, el.lineType)
                newIds.push(id)
              } else if (isText(el)) {
                const id = addText(el.x + 20, el.y + 20)
                updateElement(id, { text: el.text })
                newIds.push(id)
              }
            }
          })
          stopCapturing()
          setSelectedIds(newIds)
        }
        return
      }

      // Style copy (Cmd+Shift+C)
      if (meta && e.key.toLowerCase() === 'c' && e.shiftKey) {
        e.preventDefault()
        const el = elements.find(el => el.id === selectedIds[0])
        if (el && isShape(el)) {
          styleClipboardRef.current = { fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, opacity: el.opacity }
        }
        return
      }

      // Style paste (Cmd+Shift+V)
      if (meta && e.key.toLowerCase() === 'v' && e.shiftKey) {
        e.preventDefault()
        if (styleClipboardRef.current && selectedIds.length > 0) {
          for (const id of selectedIds) {
            updateElement(id, styleClipboardRef.current)
          }
        }
        return
      }

      // Z-ordering
      if (meta && e.key === ']' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) reorderElement(selectedIds[0], 'front')
        return
      }
      if (meta && e.key === '[' && e.shiftKey && selectedIds.length > 0) {
        e.preventDefault()
        reorderElement(selectedIds[0], 'back')
        return
      }
      if (meta && e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) reorderElement(selectedIds[0], 'forward')
        return
      }
      if (meta && e.key === '[' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) reorderElement(selectedIds[0], 'backward')
        return
      }

      // Group (Cmd+G)
      if (meta && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length >= 2) {
          groupElements(selectedIds)
        }
        return
      }

      // Ungroup (Cmd+Shift+G) — when shapes selected
      // Grid toggle (Cmd+Shift+G) — when nothing selected
      if (meta && e.key.toLowerCase() === 'g' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length > 0) {
          const el = elements.find(el => el.id === selectedIds[0])
          if (el && isShape(el) && el.groupId) {
            // Ungroup outermost level
            const outermost = el.groupId.split(',').pop()!
            ungroupElements(outermost)
          }
        } else {
          setGridEnabled(prev => !prev)
        }
        return
      }

      // Lock (Cmd+L)
      if (meta && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        for (const id of selectedIds) {
          const el = elements.find(el => el.id === id)
          if (el && isShape(el)) {
            updateElement(id, { locked: !el.locked })
          }
        }
        return
      }

      // Zoom shortcuts - handled by Canvas directly, just prevent default
      if (meta && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault()
        return
      }

      // Don't intercept non-meta keys when typing in a textarea/input
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur()
        }
        return
      }

      // Select all
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelectedIds(elements.map(el => el.id))
        return
      }

      // Tab cycles through elements
      if (e.key === 'Tab') {
        e.preventDefault()
        if (elements.length === 0) return
        if (selectedIds.length === 0) {
          setSelectedIds([elements[0].id])
        } else {
          const currentIdx = elements.findIndex(el => el.id === selectedIds[0])
          const nextIdx = (currentIdx + 1) % elements.length
          setSelectedIds([elements[nextIdx].id])
        }
        return
      }

      // Number shortcuts (Excalidraw-style)
      const numberToolMap: Record<string, Tool> = {
        '1': 'select', '2': 'hand', '3': 'rectangle', '4': 'ellipse',
        '5': 'diamond', '6': 'line', '7': 'arrow', '8': 'draw',
        '9': 'text', '0': 'frame',
      }
      if (!meta && numberToolMap[e.key]) {
        const tool = numberToolMap[e.key]
        setActiveTool(tool)
        if (tool !== 'select') setSelectedIds([])
        return
      }

      // Tool shortcuts
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
          if (!meta) {
            setActiveTool('diamond')
            setSelectedIds([])
          }
          break
        case 'p':
          setActiveTool('draw')
          setSelectedIds([])
          break
        case 'l':
          if (!meta) {
            setActiveTool('line')
            setSelectedIds([])
          }
          break
        case 'a':
          if (!meta) {
            setActiveTool('arrow')
            setSelectedIds([])
          }
          break
        case 't':
          setActiveTool('text')
          setSelectedIds([])
          break
        case 'h':
          setActiveTool('hand')
          setSelectedIds([])
          break
        case 'e':
          setActiveTool('eraser')
          setSelectedIds([])
          break
        case 'f':
          setActiveTool('frame')
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
  }, [elements, selectedIds, undo, redo, deleteElement, reorderElement, groupElements, ungroupElements, updateElement, addShape, addArrow, addText, doc, stopCapturing])

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
        addText={addText}
        addImage={addImage}
        addFrame={addFrame}
        updateElement={updateElement}
        deleteElement={deleteElement}
        gridEnabled={gridEnabled}
        darkMode={darkMode}
        minimapVisible={minimapVisible}
        setLastUsedStyle={setLastUsedStyle}
        groupElements={groupElements}
        ungroupElements={ungroupElements}
        stopCapturing={stopCapturing}
      />
      <Toolbar
        activeTool={activeTool}
        activeLineType={activeLineType}
        onToolChange={handleToolChange}
        onLineTypeChange={setActiveLineType}
        onInsertImage={(src, w, h) => {
          const id = addImage(200, 200, w, h, src)
          setSelectedIds([id])
        }}
      />
      <StatusBar
        onSettingsClick={() => setSettingsOpen(true)}
        onAiClick={() => setAiOpen(true)}
        onToggleMinimap={() => setMinimapVisible(prev => !prev)}
        onToggleDarkMode={() => setDarkMode(prev => !prev)}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        elements={elements}
        elementActions={{
          addShape, addLine, addArrow, addText, addWebCard,
          updateElement, deleteElement,
          getElements: () => elements,
        }}
      />
      <DrawingTitle drawingId={drawingId} />
      <DrawingsList currentDrawingId={drawingId} />
    </div>
  )
}
