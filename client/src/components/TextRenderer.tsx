import { useRef, useState, useCallback, useEffect, memo, type MouseEvent, type KeyboardEvent } from 'react'
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

/**
 * Inner contentEditable wrapper — memoized to prevent React from
 * reconciling (and thus wiping) the DOM text while the user types.
 */
interface EditableDivProps {
  isEditing: boolean
  initialText: string
  fontSize?: number
  fontFamily?: string
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  autoWidth: boolean
  onTextChange: (text: string) => void
  onBlur: () => void
  onMouseDown: (e: MouseEvent) => void
  divRef: React.RefObject<HTMLDivElement | null>
  onSizeChange: (w: number, h: number) => void
}

const EditableDiv = memo(function EditableDiv({
  isEditing, initialText, fontSize, fontFamily, textAlign, color,
  autoWidth, onTextChange, onBlur, onMouseDown, divRef, onSizeChange,
}: EditableDivProps) {
  // Measure after input
  const measure = useCallback(() => {
    const el = divRef.current
    if (!el) return
    onSizeChange(el.scrollWidth, el.scrollHeight)
  }, [divRef, onSizeChange])

  const handleInput = useCallback(() => {
    const el = divRef.current
    if (!el) return
    // innerText preserves line breaks from <br>, strip trailing newline
    const text = el.innerText.replace(/\n$/, '')
    onTextChange(text)
    measure()
  }, [divRef, onTextChange, measure])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      divRef.current?.blur()
    }
  }, [divRef])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  // Focus when editing starts
  useEffect(() => {
    if (isEditing && divRef.current) {
      const el = divRef.current
      requestAnimationFrame(() => {
        el.focus()
        const sel = window.getSelection()
        if (sel && el.childNodes.length > 0) {
          sel.selectAllChildren(el)
          sel.collapseToEnd()
        }
        measure()
      })
    }
  }, [isEditing, divRef, measure])

  // Set content on mount
  useEffect(() => {
    if (divRef.current && !isEditing) {
      divRef.current.textContent = initialText
      measure()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  return (
    <div
      ref={divRef}
      role="textbox"
      data-testid="text-content"
      className={`text-element__content ${isEditing ? 'text-element__content--editing' : ''}`}
      contentEditable={isEditing}
      suppressContentEditableWarning
      spellCheck={false}
      autoCorrect="off"
      data-placeholder="Type..."
      style={{
        fontSize,
        fontFamily,
        textAlign,
        color: color === 'transparent' ? undefined : color,
        pointerEvents: isEditing ? 'auto' : 'none',
        cursor: isEditing ? 'text' : 'inherit',
        width: autoWidth ? 'auto' : '100%',
      }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
      onPaste={handlePaste}
      onMouseDown={onMouseDown}
    />
  )
// Only re-render when isEditing or visual styles change — NOT on every text update
}, (prev, next) =>
  prev.isEditing === next.isEditing &&
  prev.fontSize === next.fontSize &&
  prev.fontFamily === next.fontFamily &&
  prev.textAlign === next.textAlign &&
  prev.color === next.color &&
  prev.autoWidth === next.autoWidth
)

export function TextRenderer({ element, isSelected, isEditing, onSelect, onUpdate, onStartEdit, onStopEdit, onDelete, scale, activeTool }: Props) {
  const textRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })
  const [measured, setMeasured] = useState({ w: MIN_SIZE, h: MIN_SIZE })
  const textValueRef = useRef(element.text || '')
  const wasEditingRef = useRef(false)

  const showHandles = isSelected && activeTool === 'select'
  const autoSize = element.width === 0 || element.height === 0

  // Track text changes from the editable div
  const handleTextChange = useCallback((text: string) => {
    textValueRef.current = text
    onUpdate(element.id, { text })
  }, [element.id, onUpdate])

  // Track size changes from the editable div
  const handleSizeChange = useCallback((w: number, h: number) => {
    setMeasured({ w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) })
  }, [])

  // Detect editing→not-editing transition: clean up empty elements
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      // Editing just stopped — check if empty
      const text = textValueRef.current
      if (!text || text.trim() === '') {
        onDelete(element.id)
      }
    }
    wasEditingRef.current = isEditing
  }, [isEditing, element.id, onDelete])

  // Sync content from external updates (Yjs collab) when not editing
  useEffect(() => {
    if (!isEditing && textRef.current) {
      textRef.current.textContent = element.text || ''
      textValueRef.current = element.text || ''
      // Re-measure
      const el = textRef.current
      setMeasured({ w: Math.max(MIN_SIZE, el.scrollWidth), h: Math.max(MIN_SIZE, el.scrollHeight) })
    }
  }, [element.text, isEditing])

  // Re-measure on font/size changes
  useEffect(() => {
    if (textRef.current) {
      const el = textRef.current
      requestAnimationFrame(() => {
        setMeasured({ w: Math.max(MIN_SIZE, el.scrollWidth), h: Math.max(MIN_SIZE, el.scrollHeight) })
      })
    }
  }, [element.fontSize, element.fontFamily, element.width])

  const handleBlur = useCallback(() => {
    onStopEdit()
  }, [onStopEdit])

  const handleEditableMouseDown = useCallback((e: MouseEvent) => {
    if (isEditing) e.stopPropagation()
  }, [isEditing])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (isEditing && textRef.current?.contains(e.target as Node)) return
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

  const displayW = autoSize ? measured.w : element.width
  const displayH = autoSize ? measured.h : element.height

  const vAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }

  const contentDiv = (
    <EditableDiv
      divRef={textRef}
      isEditing={isEditing}
      initialText={element.text || ''}
      fontSize={element.fontSize}
      fontFamily={element.fontFamily}
      textAlign={element.textAlign}
      color={element.stroke}
      autoWidth={autoSize}
      onTextChange={handleTextChange}
      onBlur={handleBlur}
      onMouseDown={handleEditableMouseDown}
      onSizeChange={handleSizeChange}
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
      {autoSize ? contentDiv : (
        <div
          className="text-element__text-container"
          style={{ justifyContent: vAlignMap[element.verticalAlign || 'top'] || 'flex-start' }}
        >
          {contentDiv}
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
