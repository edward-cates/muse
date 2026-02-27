import { useRef, useState, useCallback, type MouseEvent, type WheelEvent } from 'react'
import { useNotes } from '../hooks/useNotes'
import { useCursors } from '../hooks/useCursors'
import { awareness } from '../collab/provider'
import { StickyNote } from './StickyNote'
import { Cursors } from './Cursors'
import type { Tool } from '../App'

interface Props {
  activeTool: Tool
  noteColor: string
  onNotePlaced: () => void
}

export function Canvas({ activeTool, noteColor, onNotePlaced }: Props) {
  const { notes, addNote, updateNote, deleteNote } = useNotes()
  const cursors = useCursors()

  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })

  // Convert screen coords to world coords
  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - offset.x) / scale,
      y: (sy - offset.y) / scale,
    }),
    [offset, scale],
  )

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // Only handle direct canvas clicks (not clicks on notes)
      if (e.target !== e.currentTarget && activeTool === 'select') return

      if (activeTool === 'note') {
        const { x, y } = screenToWorld(e.clientX, e.clientY)
        addNote(x - 100, y - 80, noteColor)
        onNotePlaced()
        return
      }

      // Start panning
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      offsetStart.current = { ...offset }
    },
    [activeTool, noteColor, screenToWorld, addNote, onNotePlaced, offset],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Broadcast cursor position in world coords
      const world = screenToWorld(e.clientX, e.clientY)
      awareness.setLocalStateField('cursor', world)

      if (isPanning) {
        const dx = e.clientX - panStart.current.x
        const dy = e.clientY - panStart.current.y
        setOffset({
          x: offsetStart.current.x + dx,
          y: offsetStart.current.y + dy,
        })
      }
    },
    [isPanning, screenToWorld],
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const newScale = Math.min(Math.max(scale * factor, 0.1), 5)

      // Zoom toward cursor
      const cx = e.clientX
      const cy = e.clientY
      setOffset((prev) => ({
        x: cx - (cx - prev.x) * (newScale / scale),
        y: cy - (cy - prev.y) * (newScale / scale),
      }))
      setScale(newScale)
    },
    [scale],
  )

  return (
    <div
      className={`canvas ${activeTool === 'note' ? 'canvas--placing' : ''} ${isPanning ? 'canvas--panning' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        className="canvas__world"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            onUpdate={(updates) => updateNote(note.id, updates)}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
        <Cursors cursors={cursors} />
      </div>
    </div>
  )
}
