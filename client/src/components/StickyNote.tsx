import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react'
import type { Note } from '../hooks/useNotes'

interface Props {
  note: Note
  onUpdate: (updates: Partial<Omit<Note, 'id'>>) => void
  onDelete: () => void
}

export function StickyNote({ note, onUpdate, onDelete }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const noteStart = useRef({ x: 0, y: 0 })
  const textRef = useRef<HTMLTextAreaElement>(null)

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if ((e.target as HTMLElement).closest('.note__delete')) return

      e.stopPropagation()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      noteStart.current = { x: note.x, y: note.y }

      const handleMove = (ev: globalThis.MouseEvent) => {
        // We need to account for canvas scale
        const canvas = document.querySelector('.canvas__world') as HTMLElement
        const transform = window.getComputedStyle(canvas).transform
        let scale = 1
        if (transform && transform !== 'none') {
          const matrix = new DOMMatrix(transform)
          scale = matrix.a
        }

        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        onUpdate({
          x: noteStart.current.x + dx,
          y: noteStart.current.y + dy,
        })
      }

      const handleUp = () => {
        setIsDragging(false)
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [note.x, note.y, onUpdate],
  )

  // Keep textarea in sync with external changes
  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = note.text
    }
  }, [note.text])

  return (
    <div
      className={`note ${isDragging ? 'note--dragging' : ''}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        backgroundColor: note.color,
      }}
      onMouseDown={handleMouseDown}
    >
      <button className="note__delete" onClick={onDelete} title="Delete note">
        &times;
      </button>
      <textarea
        ref={textRef}
        className="note__text"
        defaultValue={note.text}
        placeholder="Type here..."
        onChange={(e) => onUpdate({ text: e.target.value })}
      />
    </div>
  )
}
