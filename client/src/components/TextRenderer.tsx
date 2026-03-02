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

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: { dir: HandleDir; x: number; y: number; cursor: string }[] = [
  { dir: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { dir: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { dir: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { dir: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { dir: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { dir: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { dir: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { dir: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

const MIN_SIZE = 20

export function TextRenderer({ element, isSelected, isEditing, onSelect, onUpdate, onStartEdit, onStopEdit, onDelete, scale, activeTool }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })

  const showHandles = isSelected && activeTool === 'select'

  const autoResize = useCallback(() => {
    const ta = textRef.current
    if (!ta) return
    ta.style.height = '0'
    ta.style.height = `${ta.scrollHeight}px`
  }, [])

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

  const handleResizeStart = useCallback(
    (e: MouseEvent, dir: HandleDir) => {
      e.stopPropagation()
      e.preventDefault()
      const startMouse = { x: e.clientX, y: e.clientY }
      const startEl = { x: element.x, y: element.y, w: element.width, h: element.height }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - startMouse.x) / scale
        const dy = (ev.clientY - startMouse.y) / scale

        let { x, y, w, h } = startEl

        if (dir.includes('e')) w = Math.max(MIN_SIZE, startEl.w + dx)
        if (dir.includes('w')) {
          const newW = Math.max(MIN_SIZE, startEl.w - dx)
          x = startEl.x + startEl.w - newW
          w = newW
        }
        if (dir.includes('s')) h = Math.max(MIN_SIZE, startEl.h + dy)
        if (dir.includes('n')) {
          const newH = Math.max(MIN_SIZE, startEl.h - dy)
          y = startEl.y + startEl.h - newH
          h = newH
        }

        onUpdate(element.id, { x, y, width: w, height: h })
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [element.id, element.x, element.y, element.width, element.height, scale, onUpdate],
  )

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textRef.current) {
      requestAnimationFrame(() => {
        if (textRef.current) {
          textRef.current.focus()
          autoResize()
        }
      })
    }
  }, [isEditing, autoResize])

  // Re-measure on text/font changes
  useEffect(() => {
    autoResize()
  }, [element.text, element.fontSize, element.fontFamily, element.width, autoResize])

  // Handle blur — remove if empty
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (textRef.current && document.activeElement === textRef.current) return
      onStopEdit()
      if (!element.text || element.text.trim() === '') {
        onDelete(element.id)
      }
    }, 0)
  }, [element.id, element.text, onDelete, onStopEdit])

  const vAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }

  return (
    <div
      data-testid="text-element"
      data-shape-id={element.id}
      className={`text-element ${isSelected ? 'text-element--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="text-element__text-container"
        style={{ justifyContent: vAlignMap[element.verticalAlign || 'top'] || 'flex-start' }}
      >
        <textarea
          ref={textRef}
          className={`text-element__content ${isEditing ? 'text-element__content--editing' : ''}`}
          defaultValue={element.text}
          placeholder={isEditing ? 'Type here...' : ''}
          style={{
            fontSize: element.fontSize,
            fontFamily: element.fontFamily,
            textAlign: element.textAlign,
            color: element.stroke === 'transparent' ? undefined : element.stroke,
            pointerEvents: isEditing ? 'auto' : 'none',
            cursor: isEditing ? 'text' : 'inherit',
          }}
          onChange={(e) => { onUpdate(element.id, { text: e.target.value }); autoResize() }}
          onBlur={handleBlur}
          onMouseDown={(e) => {
            if (isEditing) e.stopPropagation()
          }}
        />
      </div>
      {showHandles && HANDLES.map(({ dir, x, y, cursor }) => (
        <div
          key={dir}
          data-handle={dir}
          className="resize-handle"
          style={{
            left: x * element.width - 4,
            top: y * element.height - 4,
            cursor,
          }}
          onMouseDown={(e) => handleResizeStart(e, dir)}
        />
      ))}
    </div>
  )
}
