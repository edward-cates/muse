import html2canvas from 'html2canvas'
import type { CanvasElement } from '../types'

const SCALE = 0.5
const PADDING = 60
const MAX_DIMENSION = 768

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

/** Build a styled placeholder div for elements html2canvas can't render */
function makePlaceholder(doc: Document, opts: {
  width: string; height: string; label: string; sublabel: string; icon: string
  transform?: string; transformOrigin?: string
}): HTMLDivElement {
  const div = doc.createElement('div')
  div.style.cssText = `
    width:${opts.width}; height:${opts.height};
    background:#f0f1f3; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    font-family:system-ui,sans-serif; color:#555; font-size:14px;
    border:1px solid #ddd; border-radius:4px; overflow:hidden;
  `
  // Icon is a hardcoded SVG constant — safe for innerHTML
  const iconWrap = doc.createElement('div')
  iconWrap.innerHTML = opts.icon
  div.appendChild(iconWrap)

  const labelDiv = doc.createElement('div')
  labelDiv.style.cssText = 'font-weight:500;margin-top:4px'
  labelDiv.textContent = opts.label
  div.appendChild(labelDiv)

  const sublabelDiv = doc.createElement('div')
  sublabelDiv.style.cssText = 'font-size:11px;color:#999;margin-top:2px'
  sublabelDiv.textContent = opts.sublabel
  div.appendChild(sublabelDiv)

  if (opts.transform) {
    div.style.transform = opts.transform
    div.style.transformOrigin = opts.transformOrigin || 'top left'
  }
  return div
}

const CODE_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5">
  <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
</svg>`

const IMAGE_ICON = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5">
  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
  <circle cx="8.5" cy="8.5" r="1.5"></circle>
  <polyline points="21 15 16 10 5 21"></polyline>
</svg>`

/** Export the current viewport as a PNG and trigger a download. */
export async function exportCanvasAsPng(element: HTMLElement, filename = 'canvas.png'): Promise<void> {
  await waitForPaint()

  const world = element.querySelector('.canvas__world') as HTMLElement | null
  const ww = Math.max(element.clientWidth, world?.scrollWidth ?? 0)
  const wh = Math.max(element.clientHeight, world?.scrollHeight ?? 0)

  const canvas = await html2canvas(element, {
    scale: 2, // retina quality
    useCORS: true,
    logging: false,
    width: element.clientWidth,
    height: element.clientHeight,
    windowWidth: ww,
    windowHeight: wh,
    onclone: (_doc, clonedEl) => {
      // Copy textarea values (html2canvas ignores .value)
      for (const ta of clonedEl.querySelectorAll<HTMLTextAreaElement>('textarea')) {
        ta.textContent = ta.value
      }
      // Hide selection UI in export
      for (const handle of clonedEl.querySelectorAll<HTMLElement>('.resize-handle')) {
        handle.style.display = 'none'
      }
      // Replace cross-origin images with placeholders
      for (const img of clonedEl.querySelectorAll<HTMLImageElement>('.image-element img')) {
        if (img.src.startsWith('data:')) continue
        const parent = img.closest('.image-element') as HTMLElement | null
        const w = parent?.style.width || `${img.width}px`
        const h = parent?.style.height || `${img.height}px`
        const alt = img.alt || 'Image'
        img.replaceWith(makePlaceholder(_doc, {
          width: w, height: h, label: alt, sublabel: 'Image', icon: IMAGE_ICON,
        }))
      }
      // Replace iframes with placeholders
      for (const iframe of clonedEl.querySelectorAll<HTMLIFrameElement>('iframe')) {
        const card = iframe.closest('.document-card')
        const label = card?.querySelector('.document-card__title')?.textContent || 'Untitled'
        iframe.replaceWith(makePlaceholder(_doc, {
          width: iframe.style.width || '100%',
          height: iframe.parentElement?.style.height || '100%',
          label, sublabel: 'HTML Wireframe', icon: CODE_ICON,
          transform: iframe.style.transform,
          transformOrigin: iframe.style.transformOrigin,
        }))
      }
    },
  })

  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

export async function captureCanvas(element: HTMLElement): Promise<string> {
  // Wait for React to paint Yjs mutations into the DOM
  await waitForPaint()

  // html2canvas clips children based on their absolute DOM positions,
  // not their visually-transformed positions. When fitToContent scales
  // .canvas__world down, shapes may have large left/top values (e.g. 1400px)
  // that exceed element.clientWidth. We need windowWidth/windowHeight large
  // enough that html2canvas doesn't discard those elements during rendering.
  const world = element.querySelector('.canvas__world') as HTMLElement | null
  const ww = Math.max(element.clientWidth, world?.scrollWidth ?? 0)
  const wh = Math.max(element.clientHeight, world?.scrollHeight ?? 0)

  const canvas = await html2canvas(element, {
    scale: SCALE,
    useCORS: true,
    logging: false,
    width: element.clientWidth,
    height: element.clientHeight,
    windowWidth: ww,
    windowHeight: wh,
    onclone: (_doc, clonedEl) => {
      // Copy textarea values (html2canvas ignores .value)
      for (const ta of clonedEl.querySelectorAll<HTMLTextAreaElement>('textarea')) {
        ta.textContent = ta.value
      }

      // Replace cross-origin images with labeled placeholders
      // (html2canvas can't load cross-origin images; data URLs are fine)
      for (const img of clonedEl.querySelectorAll<HTMLImageElement>('.image-element img')) {
        if (img.src.startsWith('data:')) continue
        const parent = img.closest('.image-element') as HTMLElement | null
        const w = parent?.style.width || `${img.width}px`
        const h = parent?.style.height || `${img.height}px`
        const alt = img.alt || 'AI Generated Image'
        img.replaceWith(makePlaceholder(_doc, {
          width: w, height: h, label: alt, sublabel: 'Image', icon: IMAGE_ICON,
        }))
      }

      // Replace iframes with labeled placeholders (html2canvas can't render iframes)
      for (const iframe of clonedEl.querySelectorAll<HTMLIFrameElement>('iframe')) {
        const card = iframe.closest('.document-card')
        const label = card?.querySelector('.document-card__title')?.textContent || 'Untitled'
        iframe.replaceWith(makePlaceholder(_doc, {
          width: iframe.style.width || '100%',
          height: iframe.parentElement?.style.height || '100%',
          label, sublabel: 'HTML Wireframe', icon: CODE_ICON,
          transform: iframe.style.transform,
          transformOrigin: iframe.style.transformOrigin,
        }))
      }
    },
  })
  // Downscale to MAX_DIMENSION on the longest side to reduce token cost
  const { width: cw, height: ch } = canvas
  if (cw > MAX_DIMENSION || ch > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / Math.max(cw, ch)
    const tw = Math.round(cw * ratio)
    const th = Math.round(ch * ratio)
    const small = document.createElement('canvas')
    small.width = tw
    small.height = th
    const sCtx = small.getContext('2d')!
    sCtx.drawImage(canvas, 0, 0, tw, th)
    return small.toDataURL('image/jpeg', 0.6).replace('data:image/jpeg;base64,', '')
  }

  return canvas.toDataURL('image/jpeg', 0.6).replace('data:image/jpeg;base64,', '')
}
