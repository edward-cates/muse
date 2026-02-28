export type Tool = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'draw' | 'line' | 'arrow'

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond'

export type Anchor = 'top' | 'right' | 'bottom' | 'left'

export type LineType = 'straight' | 'elbow' | 'curve'

export interface ShapeElement {
  id: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  text: string
  fill: string
  stroke: string
  strokeWidth: number
}

export interface PathElement {
  id: string
  type: 'path'
  x: number
  y: number
  points: number[] // flat array [x0,y0, x1,y1, ...]
  stroke: string
  strokeWidth: number
}

export interface LineElement {
  id: string
  type: 'line'
  startShapeId: string   // '' = free endpoint
  endShapeId: string     // '' = free endpoint
  startAnchor: Anchor
  endAnchor: Anchor
  startX: number         // world coords for free endpoints
  startY: number
  endX: number
  endY: number
  stroke: string
  strokeWidth: number
  arrowStart: boolean
  arrowEnd: boolean
  lineType: LineType
}

export type CanvasElement = ShapeElement | PathElement | LineElement

export function isShape(el: CanvasElement): el is ShapeElement {
  return el.type !== 'path' && el.type !== 'line'
}

export function isPath(el: CanvasElement): el is PathElement {
  return el.type === 'path'
}

export function isLine(el: CanvasElement): el is LineElement {
  return el.type === 'line'
}
