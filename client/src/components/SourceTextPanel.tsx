import { useEffect, useRef } from 'react'
import './SourceTextPanel.css'

interface LineRange {
  start: number
  end: number
}

interface Props {
  sourceText: string
  title: string
  highlightRanges: LineRange[]
  onClose: () => void
}

export function SourceTextPanel({ sourceText, title, highlightRanges, onClose }: Props) {
  const highlightedRef = useRef<HTMLDivElement>(null)
  const lines = sourceText.split('\n')

  // Scroll to first highlighted line on mount or highlight change
  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightRanges])

  const isHighlighted = (lineNum: number) => {
    return highlightRanges.some(r => lineNum >= r.start && lineNum <= r.end)
  }

  const firstHighlightLine = highlightRanges.length > 0 ? highlightRanges[0].start : -1

  return (
    <div className="source-panel" data-testid="source-panel">
      <div className="source-panel__header">
        <div>
          <div className="source-panel__title">Original document</div>
          <div className="source-panel__meta">{title} &middot; {lines.length} lines</div>
        </div>
        <button className="source-panel__close" data-testid="source-panel-close" onClick={onClose}>
          &#x2715;
        </button>
      </div>
      <div className="source-panel__body">
        {lines.map((line, i) => {
          const lineNum = i + 1
          const highlighted = isHighlighted(lineNum)
          return (
            <div
              key={i}
              ref={lineNum === firstHighlightLine ? highlightedRef : undefined}
              className={`source-panel__line ${highlighted ? 'source-panel__line--highlighted' : ''}`}
            >
              <span className="source-panel__line-num">{lineNum}</span>
              <span className="source-panel__line-text">{line || '\u00A0'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
