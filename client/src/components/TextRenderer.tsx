import { useRef, useState, useCallback, useEffect, type MouseEvent } from 'react'
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

const MIN_SIZE = 4

export function TextRenderer({ element, isSelected, isEditing, onSelect, onUpdate, onStartEdit, onStopEdit, onDelete, scale, activeTool }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })
  const [measured, setMeasured] = useState({ w: 20, h: 20 })

  const showHandles = isSelected && activeTool === 'select'
  const autoSize = element.width === 0 || element.height === 0

  // Measure content via hidden sizer div and sync textarea
  const syncSize = useCallback(() => {
    const sizer = sizerRef.current
    const ta = textRef.current
    if (!sizer || !ta) return

    const text = ta.value || (isEditing ? ' ' : '\u200b')
    // Use innerHTML to handle newlines
    sizer.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + (text.endsWith('\n') ? '<br>' : '')

    if (autoSize) {
      const w = Math.max(MIN_SIZE, Math.ceil(sizer.scrollWidth) + 2)
      const h = Math.max(MIN_SIZE, Math.ceil(sizer.scrollHeight))
      setMeasured({ w, h })
      ta.style.width = `${w}px`
      ta.style.height = `${h}px`
    } else {
      ta.style.width = '100%'
      ta.style.height = '0'
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [autoSize, isEditing])

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
      const startW = autoSize ? measured.w : element.width
      const startH = autoSize ? measured.h : element.height
      const startEl = { x: element.x, y: element.y, w: startW, h: startH }

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
    [element.id, element.x, element.y, element.width, element.height, scale, onUpdate, autoSize, measured],
  )

  useEffect(() => {
    if (isEditing && textRef.current) {
      requestAnimationFrame(() => {
        if (textRef.current) {
          textRef.current.focus()
          syncSize()
        }
      })
    }
  }, [isEditing, syncSize])

  useEffect(() => {
    syncSize()
  }, [element.text, element.fontSize, element.fontFamily, element.width, syncSize])

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (textRef.current && document.activeElement === textRef.current) return
      onStopEdit()
      if (!element.text || element.text.trim() === '') {
        onDelete(element.id)
      }
    }, 0)
  }, [element.id, element.text, onDelete, onStopEdit])

  const displayW = autoSize ? measured.w : element.width
  const displayH = autoSize ? measured.h : element.height

  const vAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }

  const textarea = (
    <textarea
      ref={textRef}
      className={`text-element__content ${isEditing ? 'text-element__content--editing' : ''}`}
      defaultValue={element.text}
      placeholder={isEditing ? 'Type...' : ''}
      spellCheck={false}
      autoComplete="off"
      rows={1}
      style={{
        fontSize: element.fontSize,
        fontFamily: element.fontFamily,
        textAlign: element.textAlign,
        color: element.stroke === 'transparent' ? undefined : element.stroke,
        pointerEvents: isEditing ? 'auto' : 'none',
        cursor: isEditing ? 'text' : 'inherit',
      }}
      onChange={(e) => { onUpdate(element.id, { text: e.target.value }); syncSize() }}
      onBlur={handleBlur}
      onMouseDown={(e) => {
        if (isEditing) e.stopPropagation()
      }}
    />
  )

  return (
    <div
      ref={containerRef}
      data-testid="text-element"
      data-shape-id={element.id}
      className={`text-element ${isSelected ? 'text-element--selected' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: autoSize ? 'auto' : element.width,
        height: autoSize ? 'auto' : element.height,
        opacity: (element.opacity ?? 100) / 100,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Hidden sizer mirrors textarea content for width/height measurement */}
      <div
        ref={sizerRef}
        aria-hidden
        className="text-element__sizer"
        style={{
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
        }}
      />
      {autoSize ? textarea : (
        <div
          className="text-element__text-container"
          style={{ justifyContent: vAlignMap[element.verticalAlign || 'top'] || 'flex-start' }}
        >
          {textarea}
        </div>
      )}
      {showHandles && HANDLES.map(({ dir, x, y, cursor }) => (
        <div
          key={dir}
          data-handle={dir}
          className="resize-handle"
          style={{
            left: x * displayW - 4,
            top: y * displayH - 4,
            cursor,
          }}
          onMouseDown={(e) => handleResizeStart(e, dir)}
        />
      ))}
    </div>
  )
}
