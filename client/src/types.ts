export type Tool = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'draw'

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond'

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

export type CanvasElement = ShapeElement | PathElement

export function isShape(el: CanvasElement): el is ShapeElement {
  return el.type !== 'path'
}

export function isPath(el: CanvasElement): el is PathElement {
  return el.type === 'path'
}
