import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { doc } from '../collab/provider'
import type { CanvasElement, ShapeType, ShapeElement, PathElement } from '../types'

type YMapVal = string | number | number[]
const yElements = doc.getArray<Y.Map<YMapVal>>('elements')

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
  const [elements, setElements] = useState<CanvasElement[]>([])

  useEffect(() => {
    const sync = () => {
      setElements(yElements.toArray().map(readElement))
    }
    yElements.observeDeep(sync)
    sync()
    return () => yElements.unobserveDeep(sync)
  }, [])

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
      yEl.set('stroke', '#1e1e1e')
      yElements.push([yEl])
      return id
    },
    [],
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
    [],
  )

  const updateElement = useCallback(
    (id: string, updates: Partial<Omit<ShapeElement, 'id' | 'type'>> | Partial<Omit<PathElement, 'id' | 'type'>>) => {
      yElements.forEach((yEl) => {
        if (yEl.get('id') === id) {
          for (const [key, value] of Object.entries(updates)) {
            yEl.set(key, value as YMapVal)
          }
        }
      })
    },
    [],
  )

  const deleteElement = useCallback((id: string) => {
    const idx = yElements.toArray().findIndex((el) => el.get('id') === id)
    if (idx !== -1) yElements.delete(idx, 1)
  }, [])

  return { elements, addShape, addPath, updateElement, deleteElement }
}
