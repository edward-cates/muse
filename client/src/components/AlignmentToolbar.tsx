import { useCallback } from 'react'
import { isShape } from '../types'
import type { CanvasElement, ShapeElement } from '../types'

interface Props {
  selectedIds: string[]
  elements: CanvasElement[]
  updateElement: (id: string, updates: Record<string, unknown>) => void
}

export function AlignmentToolbar({ selectedIds, elements, updateElement }: Props) {
  const selected = elements.filter(el => selectedIds.includes(el.id) && isShape(el)) as ShapeElement[]

  const alignLeft = useCallback(() => {
    const minX = Math.min(...selected.map(s => s.x))
    for (const s of selected) updateElement(s.id, { x: minX })
  }, [selected, updateElement])

  const alignRight = useCallback(() => {
    const maxRight = Math.max(...selected.map(s => s.x + s.width))
    for (const s of selected) updateElement(s.id, { x: maxRight - s.width })
  }, [selected, updateElement])

  const alignTop = useCallback(() => {
    const minY = Math.min(...selected.map(s => s.y))
    for (const s of selected) updateElement(s.id, { y: minY })
  }, [selected, updateElement])

  const alignBottom = useCallback(() => {
    const maxBottom = Math.max(...selected.map(s => s.y + s.height))
    for (const s of selected) updateElement(s.id, { y: maxBottom - s.height })
  }, [selected, updateElement])

  const alignCenterH = useCallback(() => {
    const avgCenter = selected.reduce((sum, s) => sum + s.x + s.width / 2, 0) / selected.length
    for (const s of selected) updateElement(s.id, { x: avgCenter - s.width / 2 })
  }, [selected, updateElement])

  const alignCenterV = useCallback(() => {
    const avgCenter = selected.reduce((sum, s) => sum + s.y + s.height / 2, 0) / selected.length
    for (const s of selected) updateElement(s.id, { y: avgCenter - s.height / 2 })
  }, [selected, updateElement])

  const distributeH = useCallback(() => {
    if (selected.length < 3) return
    const sorted = [...selected].sort((a, b) => a.x - b.x)
    const totalWidth = sorted.reduce((sum, s) => sum + s.width, 0)
    const totalSpan = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x
    const gap = (totalSpan - totalWidth) / (sorted.length - 1)
    let currentX = sorted[0].x + sorted[0].width + gap
    for (let i = 1; i < sorted.length - 1; i++) {
      updateElement(sorted[i].id, { x: currentX })
      currentX += sorted[i].width + gap
    }
  }, [selected, updateElement])

  const distributeV = useCallback(() => {
    if (selected.length < 3) return
    const sorted = [...selected].sort((a, b) => a.y - b.y)
    const totalHeight = sorted.reduce((sum, s) => sum + s.height, 0)
    const totalSpan = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height - sorted[0].y
    const gap = (totalSpan - totalHeight) / (sorted.length - 1)
    let currentY = sorted[0].y + sorted[0].height + gap
    for (let i = 1; i < sorted.length - 1; i++) {
      updateElement(sorted[i].id, { y: currentY })
      currentY += sorted[i].height + gap
    }
  }, [selected, updateElement])

  const disableDistribute = selected.length < 3

  return (
    <div className="alignment-toolbar">
      <button data-testid="align-left" onClick={alignLeft} title="Align Left">⫷</button>
      <button data-testid="align-center-h" onClick={alignCenterH} title="Align Center H">⫾</button>
      <button data-testid="align-right" onClick={alignRight} title="Align Right">⫸</button>
      <button data-testid="align-top" onClick={alignTop} title="Align Top">⊤</button>
      <button data-testid="align-center-v" onClick={alignCenterV} title="Align Center V">⊺</button>
      <button data-testid="align-bottom" onClick={alignBottom} title="Align Bottom">⊥</button>
      <button data-testid="distribute-h" onClick={distributeH} disabled={disableDistribute} title="Distribute H">⇔</button>
      <button data-testid="distribute-v" onClick={distributeV} disabled={disableDistribute} title="Distribute V">⇕</button>
    </div>
  )
}
