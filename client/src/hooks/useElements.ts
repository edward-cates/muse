import { useEffect, useState, useCallback, useMemo } from 'react'
import * as Y from 'yjs'
import { useCollab } from '../collab/CollabContext'
import type { CanvasElement, ShapeType, ShapeElement, PathElement, LineElement, Anchor } from '../types'

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
      startShapeId: m.get('startShapeId') as string,
      endShapeId: m.get('endShapeId') as string,
      startAnchor: m.get('startAnchor') as Anchor,
      endAnchor: m.get('endAnchor') as Anchor,
      stroke: m.get('stroke') as string,
      strokeWidth: m.get('strokeWidth') as number,
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
    fill: m.get('fill') as string,
    stroke: m.get('stroke') as string,
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
    (startShapeId: string, endShapeId: string, startAnchor: Anchor, endAnchor: Anchor): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'line')
      yEl.set('startShapeId', startShapeId)
      yEl.set('endShapeId', endShapeId)
      yEl.set('startAnchor', startAnchor)
      yEl.set('endAnchor', endAnchor)
      yEl.set('stroke', '#4f46e5')
      yEl.set('strokeWidth', 1.5)
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
    const idx = yElements.toArray().findIndex((el) => el.get('id') === id)
    if (idx !== -1) yElements.delete(idx, 1)
  }, [yElements])

  return { elements, addShape, addPath, addLine, updateElement, deleteElement }
}
