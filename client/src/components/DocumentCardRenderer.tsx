import { useRef, useCallback, useState, useEffect, type MouseEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../auth/AuthContext'
import type { DocumentCardElement, Tool } from '../types'

interface Props {
  element: DocumentCardElement
  isSelected: boolean
  onSelect: (id: string, shiftKey?: boolean) => void
  onUpdate: (id: string, updates: Record<string, unknown>) => void
  scale: number
  activeTool: Tool
  onDragMove?: (id: string, x: number, y: number) => void
  onDragEnd?: () => void
}

const HANDLES: { dir: string; x: number; y: number; cursor: string }[] = [
  { dir: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { dir: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { dir: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { dir: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { dir: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { dir: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { dir: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { dir: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

const typeLabels: Record<string, string> = {
  canvas: 'Canvas',
  html_artifact: 'HTML Wireframe',
  markdown: 'Markdown',
  research: 'Research',
}

const typeIcons: Record<string, React.ReactNode> = {
  canvas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
    </svg>
  ),
  html_artifact: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  markdown: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8v8l2-2.5L10 16V8" />
      <path d="M18 12l-2.5-3v6" />
      <path d="M13 12l2.5 3" />
    </svg>
  ),
  research: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 2h12v16H4z" strokeLinejoin="round" />
      <path d="M7 6h6M7 9h6M7 12h3" />
    </svg>
  ),
}

/** Thumbnail scale: render HTML at 800px wide, scale to fit card */
const THUMBNAIL_RENDER_WIDTH = 800

export function DocumentCardRenderer({ element, isSelected, onSelect, onUpdate, scale, activeTool, onDragMove, onDragEnd }: Props) {
  const { session } = useAuth()
  const dragStart = useRef({ x: 0, y: 0 })
  const elStart = useRef({ x: 0, y: 0 })
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [markdownContent, setMarkdownContent] = useState<string | null>(null)

  // Sync title from server (handles renames done on the child canvas)
  useEffect(() => {
    if (!session?.access_token || !element.documentId) return
    let cancelled = false

    fetch(`/api/documents/${element.documentId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.document) return
        const serverTitle = data.document.title
        if (serverTitle && serverTitle !== element.title) {
          onUpdate(element.id, { title: serverTitle })
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [element.documentId, element.id, element.title, session?.access_token, onUpdate])

  // Fetch content for thumbnail preview (html_artifact and markdown)
  useEffect(() => {
    if (element.documentType !== 'html_artifact' && element.documentType !== 'markdown') return
    if (!session?.access_token || !element.documentId) return

    let cancelled = false
    fetch(`/api/documents/${element.documentId}/content`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.content) {
          if (element.documentType === 'html_artifact') {
            setHtmlContent(data.content)
          } else {
            setMarkdownContent(data.content)
          }
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [element.documentId, element.documentType, element.contentVersion, session?.access_token])

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
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
        const newX = elStart.current.x + dx
        const newY = elStart.current.y + dy
        onUpdate(element.id, { x: newX, y: newY })
        onDragMove?.(element.id, newX, newY)
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        onDragEnd?.()
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [element.id, element.x, element.y, scale, onSelect, onUpdate, activeTool, onDragMove, onDragEnd],
  )

  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      window.location.hash = `#/d/${element.documentId}`
    },
    [element.documentId],
  )

  const handleResizeStart = useCallback(
    (e: MouseEvent, dir: string) => {
      e.stopPropagation()
      e.preventDefault()
      const startMouse = { x: e.clientX, y: e.clientY }
      const startEl = { x: element.x, y: element.y, w: element.width, h: element.height }

      const handleMove = (ev: globalThis.MouseEvent) => {
        const dx = (ev.clientX - startMouse.x) / scale
        const dy = (ev.clientY - startMouse.y) / scale
        let { x, y, w, h } = startEl

        if (dir.includes('e')) w = Math.max(200, startEl.w + dx)
        if (dir.includes('w')) { const newW = Math.max(200, startEl.w - dx); x = startEl.x + startEl.w - newW; w = newW }
        if (dir.includes('s')) h = Math.max(120, startEl.h + dy)
        if (dir.includes('n')) { const newH = Math.max(120, startEl.h - dy); y = startEl.y + startEl.h - newH; h = newH }

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

  const showHandles = isSelected && activeTool === 'select'
  const isHtml = element.documentType === 'html_artifact'
  const isMd = element.documentType === 'markdown'
  const hasPreview = isHtml && htmlContent
  const hasMdPreview = isMd && markdownContent

  // Chrome bar height for html_artifact
  const chromeH = isHtml ? 24 : 0
  // Area available for content
  const previewW = element.width
  const previewH = element.height - chromeH
  const thumbScale = previewW / THUMBNAIL_RENDER_WIDTH

  return (
    <div
      data-testid="document-card"
      data-shape-id={element.id}
      className={`shape document-card ${isSelected ? 'shape--selected' : ''} ${element.documentType === 'research' ? 'document-card--research' : ''} ${isHtml ? 'document-card--html' : ''} ${isMd ? 'document-card--markdown' : ''}`}
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
      {element.jobStatus && element.jobStatus !== 'completed' && (
        <div className={`document-card__job-status document-card__job-status--${element.jobStatus}`}>
          {element.jobStatus === 'pending' && (
            <span className="document-card__job-dot document-card__job-dot--pending" />
          )}
          {element.jobStatus === 'running' && (
            <span className="document-card__job-dot document-card__job-dot--running" />
          )}
          {(element.jobStatus === 'failed' || element.jobStatus === 'stalled') && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          )}
          <span className="document-card__job-label">
            {element.jobStatus === 'pending' ? 'Queued'
              : element.jobStatus === 'running' ? (element.description || 'Working...')
              : element.jobStatus === 'failed' ? 'Failed' : 'Stalled'}
          </span>
        </div>
      )}
      {isHtml && (
        <div className="document-card__chrome">
          <span className="document-card__chrome-dot document-card__chrome-dot--r" />
          <span className="document-card__chrome-dot document-card__chrome-dot--y" />
          <span className="document-card__chrome-dot document-card__chrome-dot--g" />
        </div>
      )}
      {hasPreview ? (
        <div
          className="document-card__preview"
          style={{
            top: chromeH,
            width: previewW,
            height: previewH,
          }}
        >
          <iframe
            srcDoc={htmlContent}
            sandbox="allow-scripts"
            tabIndex={-1}
            style={{
              width: THUMBNAIL_RENDER_WIDTH,
              height: previewH / thumbScale,
              transform: `scale(${thumbScale})`,
              transformOrigin: 'top left',
              border: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : hasMdPreview ? (
        <div className="document-card__md-preview">
          <ReactMarkdown>{markdownContent}</ReactMarkdown>
        </div>
      ) : (
        <div className={`document-card__inner ${element.documentType === 'research' ? 'document-card__inner--research' : ''}`}>
          <div className="document-card__icon">
            {typeIcons[element.documentType] || typeIcons.canvas}
          </div>
          <div className="document-card__title">{element.title || 'Untitled'}</div>
          {element.topicLabels ? (
            <div className="document-card__topics">
              {element.topicLabels.split('|').map((label, i) => {
                const colors = element.topicColors ? element.topicColors.split('|') : []
                return (
                  <div key={i} className="document-card__topic">
                    <span className="document-card__topic-dot" style={{ background: colors[i] || '#94a3b8' }} />
                    <span className="document-card__topic-label">{label}</span>
                  </div>
                )
              })}
            </div>
          ) : element.description ? (
            <div className="document-card__description">{element.description}</div>
          ) : (
            <div className="document-card__type">{typeLabels[element.documentType] || element.documentType}</div>
          )}
          <div className="document-card__hint">Double-click to open</div>
        </div>
      )}
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
