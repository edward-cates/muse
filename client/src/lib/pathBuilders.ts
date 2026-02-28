import type { LineType } from '../types'

interface Point { x: number; y: number }

export function buildStraightPath(start: Point, end: Point): string {
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
}

export function buildElbowPath(start: Point, end: Point): string {
  const midX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} H ${midX} V ${end.y} H ${end.x}`
}

export function buildCurvePath(start: Point, end: Point): string {
  const dx = end.x - start.x
  const cp1x = start.x + dx * 0.4
  const cp2x = end.x - dx * 0.4
  return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`
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
