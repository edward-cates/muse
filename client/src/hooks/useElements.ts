import { useEffect, useState, useCallback, useMemo } from 'react'
import * as Y from 'yjs'
import { useCollab } from '../collab/CollabContext'
import type { CanvasElement, ShapeType, ShapeElement, PathElement, LineElement, Anchor, LineType } from '../types'

type YMapVal = string | number | number[]

function readElement(m: Y.Map<YMapVal>): CanvasElement {
  const type = m.get('type') as string
  if (type === 'path') {
    return {
      id: m.get('id') as string,
      type: 'path',
      x: m.get('x') as number,
      y: m.get('y') as number,
      points: m.get('points') as number[],
      stroke: m.get('stroke') as string,
      strokeWidth: m.get('strokeWidth') as number,
    }
  }
  if (type === 'line') {
    return {
      id: m.get('id') as string,
      type: 'line',
      startShapeId: (m.get('startShapeId') as string) || '',
      endShapeId: (m.get('endShapeId') as string) || '',
      startAnchor: (m.get('startAnchor') as Anchor) || 'right',
      endAnchor: (m.get('endAnchor') as Anchor) || 'left',
      startX: (m.get('startX') as number) || 0,
      startY: (m.get('startY') as number) || 0,
      endX: (m.get('endX') as number) || 0,
      endY: (m.get('endY') as number) || 0,
      stroke: (m.get('stroke') as string) || '#4f46e5',
      strokeWidth: (m.get('strokeWidth') as number) || 1.5,
      arrowStart: (m.get('arrowStart') as unknown as boolean) ?? false,
      arrowEnd: (m.get('arrowEnd') as unknown as boolean) ?? true,
      lineType: ((m.get('lineType') as string) || 'straight') as LineType,
    }
  }
  return {
    id: m.get('id') as string,
    type: type as ShapeType,
    x: m.get('x') as number,
    y: m.get('y') as number,
    width: m.get('width') as number,
    height: m.get('height') as number,
    text: m.get('text') as string,
    fill: (m.get('fill') as string) || '#ffffff',
    stroke: (m.get('stroke') as string) || '#4f46e5',
    strokeWidth: (m.get('strokeWidth') as number) || 1.5,
  }
}

export function useElements() {
  const { doc } = useCollab()
  const yElements = useMemo(() => doc.getArray<Y.Map<YMapVal>>('elements'), [doc])
  const [elements, setElements] = useState<CanvasElement[]>([])

  useEffect(() => {
    const sync = () => {
      setElements(yElements.toArray().map(readElement))
    }
    yElements.observeDeep(sync)
    sync()
    return () => yElements.unobserveDeep(sync)
  }, [yElements])

  const addShape = useCallback(
    (type: ShapeType, x: number, y: number, w: number, h: number): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', type)
      yEl.set('x', x)
      yEl.set('y', y)
      yEl.set('width', w)
      yEl.set('height', h)
      yEl.set('text', '')
      yEl.set('fill', '#ffffff')
      yEl.set('stroke', '#4f46e5')
      yEl.set('strokeWidth', 1.5)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const addPath = useCallback(
    (x: number, y: number, points: number[], stroke: string, strokeWidth: number): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'path')
      yEl.set('x', x)
      yEl.set('y', y)
      yEl.set('points', points)
      yEl.set('stroke', stroke)
      yEl.set('strokeWidth', strokeWidth)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const addLine = useCallback(
    (startShapeId: string, endShapeId: string, startAnchor: Anchor, endAnchor: Anchor, lineType: LineType = 'straight'): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'line')
      yEl.set('startShapeId', startShapeId)
      yEl.set('endShapeId', endShapeId)
      yEl.set('startAnchor', startAnchor)
      yEl.set('endAnchor', endAnchor)
      yEl.set('startX', 0)
      yEl.set('startY', 0)
      yEl.set('endX', 0)
      yEl.set('endY', 0)
      yEl.set('stroke', '#4f46e5')
      yEl.set('strokeWidth', 1.5)
      yEl.set('arrowStart', 0)
      yEl.set('arrowEnd', 1)
      yEl.set('lineType', lineType)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const addArrow = useCallback(
    (startShapeId: string, endShapeId: string, startAnchor: Anchor, endAnchor: Anchor, startX: number, startY: number, endX: number, endY: number, lineType: LineType = 'straight'): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'line')
      yEl.set('startShapeId', startShapeId)
      yEl.set('endShapeId', endShapeId)
      yEl.set('startAnchor', startAnchor)
      yEl.set('endAnchor', endAnchor)
      yEl.set('startX', startX)
      yEl.set('startY', startY)
      yEl.set('endX', endX)
      yEl.set('endY', endY)
      yEl.set('stroke', '#4f46e5')
      yEl.set('strokeWidth', 1.5)
      yEl.set('arrowStart', 0)
      yEl.set('arrowEnd', 1)
      yEl.set('lineType', lineType)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const updateElement = useCallback(
    (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>> | Partial<Omit<PathElement, 'id' | 'type'>> | Partial<Omit<LineElement, 'id' | 'type'>>) => {
      yElements.forEach((yEl) => {
        if (yEl.get('id') === id) {
          for (const [key, value] of Object.entries(updates)) {
            yEl.set(key, value as YMapVal)
          }
        }
      })
    },
    [yElements],
  )

  const deleteElement = useCallback((id: string) => {
    const arr = yElements.toArray()

    // Cascade: if deleting a shape, also delete all attached connectors
    const el = arr.find((e) => e.get('id') === id)
    if (el && el.get('type') !== 'line') {
      // Find all lines attached to this shape and delete them (reverse order to preserve indices)
      const toDelete: number[] = []
      arr.forEach((e, i) => {
        if (e.get('type') === 'line' && (e.get('startShapeId') === id || e.get('endShapeId') === id)) {
          toDelete.push(i)
        }
      })
      // Also add the shape itself
      const shapeIdx = arr.findIndex((e) => e.get('id') === id)
      if (shapeIdx !== -1) toDelete.push(shapeIdx)

      // Delete in reverse order so indices stay valid
      toDelete.sort((a, b) => b - a)
      for (const i of toDelete) {
        yElements.delete(i, 1)
      }
      return
    }

    const idx = arr.findIndex((e) => e.get('id') === id)
    if (idx !== -1) yElements.delete(idx, 1)
  }, [yElements])

  return { elements, addShape, addPath, addLine, addArrow, updateElement, deleteElement }
}
