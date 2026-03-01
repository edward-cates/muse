import type { CanvasElement } from '../types'
import { isShape } from '../types'

/** Named anchor to 0-1 ratio mapping */
const ANCHOR_MAP: Record<string, { x: number; y: number }> = {
  top: { x: 0.5, y: 0 },
  right: { x: 1, y: 0.5 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
}

export function anchorNameToRatio(name: string): { x: number; y: number } | null {
  return ANCHOR_MAP[name] ?? null
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function validateHexColor(color: string): { valid: boolean; normalized: string; warning?: string } {
  if (HEX_RE.test(color)) return { valid: true, normalized: color }
  // Try fixing common issues: missing #
  if (/^[0-9a-fA-F]{6}$/.test(color)) {
    return { valid: true, normalized: `#${color}`, warning: `Color missing #, normalized to #${color}` }
  }
  return { valid: false, normalized: '#4465e9', warning: `Invalid hex color "${color}", using default #4465e9` }
}

const MIN_SIZE = 20

export function clampDimensions(w: number, h: number): { width: number; height: number; warning?: string } {
  const cw = Math.max(MIN_SIZE, w)
  const ch = Math.max(MIN_SIZE, h)
  if (cw !== w || ch !== h) {
    return { width: cw, height: ch, warning: `Dimensions clamped to minimum ${MIN_SIZE}px (was ${w}×${h})` }
  }
  return { width: cw, height: ch }
}

export function checkOverlaps(
  x: number, y: number, w: number, h: number,
  elements: CanvasElement[],
  excludeId?: string,
): string[] {
  const warnings: string[] = []
  for (const el of elements) {
    if (el.id === excludeId) continue
    if (!isShape(el)) continue
    const ox = el.x, oy = el.y, ow = el.width, oh = el.height
    if (x < ox + ow && x + w > ox && y < oy + oh && y + h > oy) {
      const label = el.text ? ` "${el.text}"` : ''
      warnings.push(`Overlaps with ${el.type}${label} (${el.id.slice(0, 8)})`)
    }
  }
  return warnings
}
