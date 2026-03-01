import { useRef, useCallback, useEffect, type MouseEvent } from 'react'
import type { TextElement, Tool } from '../types'

interface Props {
  element: TextElement
  isSelected: boolean
  isEditing: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onDelete: (id: string) => void
  scale: number
  activeTool: Tool
}

export function TextRenderer({ element, isSelected, isEditing, onSelect, onUpdate, onStartEdit, onStopEdit, onDelete, scale, activeTool }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isEditing && (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (activeTool === 'hand') {
        e.stopPropagation()
        onSelect(element.id, e.shiftKey)
        return
      }
      if (activeTool !== 'select') return

      e.stopPropagation()
      onSelect(element.id, e.shiftKey)
      if (e.shiftKey) return

      dragStart.current = { x: e.clientX, y: e.clientY }
      elStart.current = { x: element.x, y: element.y }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - dragStart.current.x) / scale
        const dy = (ev.clientY - dragStart.current.y) / scale
        onUpdate(element.id, {
          x: elStart.current.x + dx,
          y: elStart.current.y + dy,
        })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [element.id, element.x, element.y, scale, onSelect, onUpdate, isEditing, activeTool],
  )

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      onStartEdit(element.id)
    },
    [element.id, onStartEdit],
  )

  // Focus textarea when editing starts — use requestAnimationFrame to ensure
  // it runs after the browser has finished processing the current event (click)
  // and after React StrictMode's effect replay
  useEffect(() => {
    if (isEditing && textRef.current) {
      requestAnimationFrame(() => {
        if (textRef.current) {
          textRef.current.focus()
        }
      })
    }
  }, [isEditing])

  // Handle blur — remove if empty (deferred to avoid StrictMode double-mount race)
  const handleBlur = useCallback(() => {
    // Defer the check so that a StrictMode remount can refocus before we delete
    setTimeout(() => {
      // If the textarea regained focus (e.g. StrictMode remount), don't delete
      if (textRef.current && document.activeElement === textRef.current) return
      onStopEdit()
      if (!element.text || element.text.trim() === '') {
        onDelete(element.id)
      }
    }, 0)
  }, [element.id, element.text, onDelete, onStopEdit])

  return (
    <div
      data-testid="text-element"
      data-shape-id={element.id}
      className={`shape text-element ${isSelected ? 'shape--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        minHeight: element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <textarea
        ref={textRef}
        className={`shape__text ${isEditing ? 'shape__text--editing' : ''}`}
        defaultValue={element.text}
        placeholder={isEditing ? 'Type here...' : ''}
        style={{
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          textAlign: element.textAlign,
          color: element.fill,
          pointerEvents: isEditing ? 'auto' : 'none',
          cursor: isEditing ? 'text' : 'inherit',
        }}
        onChange={(e) => onUpdate(element.id, { text: e.target.value })}
        onBlur={handleBlur}
        onMouseDown={(e) => {
          if (isEditing) e.stopPropagation()
        }}
      />
    </div>
  )
}
