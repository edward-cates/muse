import type { LineType } from '../types'

interface Point { x: number; y: number }

export function buildStraightPath(start: Point, end: Point): string {
  // Add sub-pixel offset to prevent zero-dimension SVG bounding rect
  // (needed for Playwright visibility checks on perfectly H/V lines)
  const ey = Math.abs(start.y - end.y) < 0.5 ? end.y + 0.5 : end.y
  const ex = Math.abs(start.x - end.x) < 0.5 ? end.x + 0.5 : end.x
  return `M ${start.x} ${start.y} L ${ex} ${ey}`
}

export function buildElbowPath(start: Point, end: Point): string {
  const midX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`
}

export function buildCurvePath(start: Point, end: Point): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = dist * 0.4

  // Normalise direction; fall back to rightward if points overlap
  const len = dist || 1
  const nx = dx / len
  const ny = dy / len

  const cp1x = start.x + nx * offset
  const cp1y = start.y + ny * offset
  const cp2x = end.x - nx * offset
  const cp2y = end.y - ny * offset
  return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`
}

export function buildPath(lineType: LineType, start: Point, end: Point): string {
  switch (lineType) {
    case 'elbow':
      return buildElbowPath(start, end)
    case 'curve':
      return buildCurvePath(start, end)
    default:
      return buildStraightPath(start, end)
  }
}
