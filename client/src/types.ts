export type Tool = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'draw' | 'line' | 'arrow' | 'text' | 'hand' | 'eraser' | 'frame' | 'triangle' | 'hexagon' | 'star' | 'cloud'

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'star' | 'cloud'

export type LineType = 'straight' | 'elbow' | 'curve'

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type ArrowheadStyle = 'none' | 'triangle' | 'open' | 'diamond' | 'circle'

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
  fontSize: number
  fontFamily: string
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  strokeStyle: StrokeStyle
  opacity: number
  cornerRadius: number
  shadow: boolean
  rotation: number
  flipH: boolean
  flipV: boolean
  locked: boolean
  groupId: string
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
  startAnchorX: number   // 0-1 ratio relative to shape bounding box
  startAnchorY: number
  endAnchorX: number
  endAnchorY: number
  startX: number         // world coords for free endpoints
  startY: number
  endX: number
  endY: number
  stroke: string
  strokeWidth: number
  arrowStart: boolean
  arrowEnd: boolean
  lineType: LineType
  strokeStyle: StrokeStyle
  opacity: number
  label: string
  arrowStartStyle: ArrowheadStyle
  arrowEndStyle: ArrowheadStyle
  waypoints: number[]
}

export interface TextElement {
  id: string
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  fontFamily: string
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface ImageElement {
  id: string
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  src: string
  opacity: number
}

export interface FrameElement {
  id: string
  type: 'frame'
  x: number
  y: number
  width: number
  height: number
  label: string
  children: string[]
  opacity: number
}

export interface WebCardElement {
  id: string
  type: 'webcard'
  x: number
  y: number
  width: number
  height: number
  url: string
  title: string
  snippet: string
  faviconUrl: string
  content: string
  sourceType: 'search' | 'url' | 'manual'
  opacity: number
}

export type CanvasElement = ShapeElement | PathElement | LineElement | TextElement | ImageElement | FrameElement | WebCardElement

export function isShape(el: CanvasElement): el is ShapeElement {
  const shapeTypes: string[] = ['rectangle', 'ellipse', 'diamond', 'triangle', 'hexagon', 'star', 'cloud']
  return shapeTypes.includes(el.type)
}

export function isPath(el: CanvasElement): el is PathElement {
  return el.type === 'path'
}

export function isLine(el: CanvasElement): el is LineElement {
  return el.type === 'line'
}

export function isText(el: CanvasElement): el is TextElement {
  return el.type === 'text'
}

export function isImage(el: CanvasElement): el is ImageElement {
  return el.type === 'image'
}

export function isFrame(el: CanvasElement): el is FrameElement {
  return el.type === 'frame'
}

export function isWebCard(el: CanvasElement): el is WebCardElement {
  return el.type === 'webcard'
}
