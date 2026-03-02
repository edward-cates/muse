import html2canvas from 'html2canvas'
import type { CanvasElement } from '../types'

const SCALE = 0.5
const PADDING = 60

/** Wait for React to flush DOM updates after Yjs mutations */
function waitForPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** Compute bounding box of all elements, with padding */
export function computeBounds(elements: CanvasElement[]): { x: number; y: number; width: number; height: number } | null {
  if (elements.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of elements) {
    if (!('x' in el)) continue
    const e = el as { x: number; y: number; width?: number; height?: number }
    const x = e.x
    const y = e.y
    const w = e.width ?? 160
    const h = e.height ?? 80
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }

  if (!isFinite(minX)) return null

  return {
    x: minX - PADDING,
    y: minY - PADDING,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  }
}

export async function captureCanvas(element: HTMLElement): Promise<string> {
  // Wait for React to paint Yjs mutations into the DOM
  await waitForPaint()

  const canvas = await html2canvas(element, {
    scale: SCALE,
    useCORS: true,
    logging: false,
    width: element.clientWidth,
    height: element.clientHeight,
    windowWidth: element.clientWidth,
    windowHeight: element.clientHeight,
  })
  return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
}
