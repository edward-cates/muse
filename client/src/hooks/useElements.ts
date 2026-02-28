import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import * as Y from 'yjs'
import { useCollab } from '../collab/CollabContext'
import type { CanvasElement, ShapeType, ShapeElement, PathElement, LineElement, LineType } from '../types'

type YMapVal = string | number | number[]

export function readElement(m: Y.Map<YMapVal>): CanvasElement {
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
  if (type === 'text') {
    return {
      id: m.get('id') as string,
      type: 'text',
      x: m.get('x') as number,
      y: m.get('y') as number,
      width: (m.get('width') as number) || 200,
      height: (m.get('height') as number) || 40,
      text: (m.get('text') as string) || '',
      fontSize: (m.get('fontSize') as number) || 16,
      fontFamily: (m.get('fontFamily') as string) || 'sans-serif',
      textAlign: ((m.get('textAlign') as string) || 'left') as 'left' | 'center' | 'right',
      verticalAlign: ((m.get('verticalAlign') as string) || 'top') as 'top' | 'middle' | 'bottom',
      fill: (m.get('fill') as string) || '#000000',
      stroke: (m.get('stroke') as string) || 'transparent',
      strokeWidth: (m.get('strokeWidth') as number) || 0,
      opacity: (m.get('opacity') as number) ?? 100,
    }
  }
  if (type === 'line') {
    return {
      id: m.get('id') as string,
      type: 'line',
      startShapeId: (m.get('startShapeId') as string) || '',
      endShapeId: (m.get('endShapeId') as string) || '',
      startAnchorX: (m.get('startAnchorX') as number) ?? 1,
      startAnchorY: (m.get('startAnchorY') as number) ?? 0.5,
      endAnchorX: (m.get('endAnchorX') as number) ?? 0,
      endAnchorY: (m.get('endAnchorY') as number) ?? 0.5,
      startX: (m.get('startX') as number) || 0,
      startY: (m.get('startY') as number) || 0,
      endX: (m.get('endX') as number) || 0,
      endY: (m.get('endY') as number) || 0,
      stroke: (m.get('stroke') as string) || '#4f46e5',
      strokeWidth: (m.get('strokeWidth') as number) || 1.5,
      arrowStart: (m.get('arrowStart') as unknown as boolean) ?? false,
      arrowEnd: (m.get('arrowEnd') as unknown as boolean) ?? true,
      lineType: ((m.get('lineType') as string) || 'straight') as LineType,
      strokeStyle: ((m.get('strokeStyle') as string) || 'solid') as 'solid' | 'dashed' | 'dotted',
      opacity: (m.get('opacity') as number) ?? 100,
      label: (m.get('label') as string) || '',
      arrowStartStyle: ((m.get('arrowStartStyle') as string) || 'none') as 'none' | 'triangle' | 'open' | 'diamond' | 'circle',
      arrowEndStyle: ((m.get('arrowEndStyle') as string) || 'triangle') as 'none' | 'triangle' | 'open' | 'diamond' | 'circle',
      waypoints: (m.get('waypoints') as number[]) || [],
    }
  }
  if (type === 'image') {
    return {
      id: m.get('id') as string,
      type: 'image',
      x: m.get('x') as number,
      y: m.get('y') as number,
      width: (m.get('width') as number) || 200,
      height: (m.get('height') as number) || 200,
      src: (m.get('src') as string) || '',
      opacity: (m.get('opacity') as number) ?? 100,
    }
  }
  if (type === 'frame') {
    return {
      id: m.get('id') as string,
      type: 'frame',
      x: m.get('x') as number,
      y: m.get('y') as number,
      width: (m.get('width') as number) || 400,
      height: (m.get('height') as number) || 300,
      label: (m.get('label') as string) || 'Frame',
      children: ((m.get('children') as unknown) as string[]) || [],
      opacity: (m.get('opacity') as number) ?? 100,
    }
  }
  return {
    id: m.get('id') as string,
    type: type as ShapeType,
    x: m.get('x') as number,
    y: m.get('y') as number,
    width: m.get('width') as number,
    height: m.get('height') as number,
    text: (m.get('text') as string) || '',
    fill: (m.get('fill') as string) || '#ffffff',
    stroke: (m.get('stroke') as string) || '#4f46e5',
    strokeWidth: (m.get('strokeWidth') as number) || 1.5,
    fontSize: (m.get('fontSize') as number) || 14,
    fontFamily: (m.get('fontFamily') as string) || 'sans-serif',
    textAlign: ((m.get('textAlign') as string) || 'center') as 'left' | 'center' | 'right',
    verticalAlign: ((m.get('verticalAlign') as string) || 'middle') as 'top' | 'middle' | 'bottom',
    strokeStyle: ((m.get('strokeStyle') as string) || 'solid') as 'solid' | 'dashed' | 'dotted',
    opacity: (m.get('opacity') as number) ?? 100,
    cornerRadius: (m.get('cornerRadius') as number) || 3,
    shadow: (m.get('shadow') as unknown as boolean) ?? false,
    rotation: (m.get('rotation') as number) || 0,
    flipH: (m.get('flipH') as unknown as boolean) ?? false,
    flipV: (m.get('flipV') as unknown as boolean) ?? false,
    locked: (m.get('locked') as unknown as boolean) ?? false,
    groupId: (m.get('groupId') as string) || '',
  }
}

export function useElements() {
  const { doc } = useCollab()
  const yElements = useMemo(() => doc.getArray<Y.Map<YMapVal>>('elements'), [doc])
  const [elements, setElements] = useState<CanvasElement[]>([])

  const undoManager = useMemo(() => {
    const um = new Y.UndoManager(yElements, { captureTimeout: 500 })
    return um
  }, [yElements])

  // Track last-used fill/stroke for new shapes
  const lastUsedStyleRef = useRef<{ fill: string; stroke: string }>({ fill: '#ffffff', stroke: '#4f46e5' })

  useEffect(() => {
    const sync = () => {
      setElements(yElements.toArray().map(readElement))
    }
    yElements.observeDeep(sync)
    sync()
    return () => yElements.unobserveDeep(sync)
  }, [yElements])

  const undo = useCallback(() => {
    undoManager.undo()
  }, [undoManager])

  const redo = useCallback(() => {
    undoManager.redo()
  }, [undoManager])

  const stopCapturing = useCallback(() => {
    undoManager.stopCapturing()
  }, [undoManager])

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
      yEl.set('fill', lastUsedStyleRef.current.fill)
      yEl.set('stroke', lastUsedStyleRef.current.stroke)
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
    (startShapeId: string, endShapeId: string, startAnchorX: number, startAnchorY: number, endAnchorX: number, endAnchorY: number, lineType: LineType = 'straight'): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'line')
      yEl.set('startShapeId', startShapeId)
      yEl.set('endShapeId', endShapeId)
      yEl.set('startAnchorX', startAnchorX)
      yEl.set('startAnchorY', startAnchorY)
      yEl.set('endAnchorX', endAnchorX)
      yEl.set('endAnchorY', endAnchorY)
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
    (startShapeId: string, endShapeId: string, startAnchorX: number, startAnchorY: number, endAnchorX: number, endAnchorY: number, startX: number, startY: number, endX: number, endY: number, lineType: LineType = 'straight'): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'line')
      yEl.set('startShapeId', startShapeId)
      yEl.set('endShapeId', endShapeId)
      yEl.set('startAnchorX', startAnchorX)
      yEl.set('startAnchorY', startAnchorY)
      yEl.set('endAnchorX', endAnchorX)
      yEl.set('endAnchorY', endAnchorY)
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

  const addText = useCallback(
    (x: number, y: number): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'text')
      yEl.set('x', x)
      yEl.set('y', y)
      yEl.set('width', 200)
      yEl.set('height', 40)
      yEl.set('text', '')
      yEl.set('fontSize', 16)
      yEl.set('fontFamily', 'sans-serif')
      yEl.set('textAlign', 'left')
      yEl.set('verticalAlign', 'top')
      yEl.set('fill', '#000000')
      yEl.set('stroke', 'transparent')
      yEl.set('strokeWidth', 0)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const addImage = useCallback(
    (x: number, y: number, w: number, h: number, src: string): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'image')
      yEl.set('x', x)
      yEl.set('y', y)
      yEl.set('width', w)
      yEl.set('height', h)
      yEl.set('src', src)
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const addFrame = useCallback(
    (x: number, y: number, w: number, h: number): string => {
      const id = crypto.randomUUID()
      const yEl = new Y.Map<YMapVal>()
      yEl.set('id', id)
      yEl.set('type', 'frame')
      yEl.set('x', x)
      yEl.set('y', y)
      yEl.set('width', w)
      yEl.set('height', h)
      yEl.set('label', 'Frame')
      yElements.push([yEl])
      return id
    },
    [yElements],
  )

  const updateElement = useCallback(
    (id: string, updates: Record<string, unknown>) => {
      yElements.forEach((yEl) => {
        if (yEl.get('id') === id) {
          for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'boolean') {
              yEl.set(key, value ? 1 : 0)
            } else {
              yEl.set(key, value as YMapVal)
            }
          }
        }
      })
    },
    [yElements],
  )

  const deleteElement = useCallback((id: string) => {
    doc.transact(() => {
      const arr = yElements.toArray()

      // Cascade: if deleting a shape, also delete all attached connectors
      const el = arr.find((e) => e.get('id') === id)
      if (el && el.get('type') !== 'line' && el.get('type') !== 'path') {
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
    })
  }, [yElements, doc])

  const reorderElement = useCallback((id: string, action: 'front' | 'back' | 'forward' | 'backward') => {
    doc.transact(() => {
      const arr = yElements.toArray()
      const idx = arr.findIndex((e) => e.get('id') === id)
      if (idx === -1) return

      const lastIdx = arr.length - 1
      let newIdx: number

      switch (action) {
        case 'front':
          if (idx === lastIdx) return
          newIdx = lastIdx
          break
        case 'back':
          if (idx === 0) return
          newIdx = 0
          break
        case 'forward':
          if (idx === lastIdx) return
          newIdx = idx + 1
          break
        case 'backward':
          if (idx === 0) return
          newIdx = idx - 1
          break
      }

      // Clone the Y.Map data before deleting
      const yEl = arr[idx]
      const clone = new Y.Map<YMapVal>()
      for (const [key, value] of yEl.entries()) {
        clone.set(key, value)
      }

      yElements.delete(idx, 1)
      yElements.insert(newIdx, [clone])
    })
  }, [yElements, doc])

  const groupElements = useCallback((ids: string[]) => {
    const groupId = crypto.randomUUID()
    doc.transact(() => {
      yElements.forEach((yEl) => {
        if (ids.includes(yEl.get('id') as string)) {
          const existing = (yEl.get('groupId') as string) || ''
          // Append new groupId to support nested groups
          yEl.set('groupId', existing ? `${existing},${groupId}` : groupId)
        }
      })
    })
    return groupId
  }, [yElements, doc])

  const ungroupElements = useCallback((groupId: string) => {
    doc.transact(() => {
      yElements.forEach((yEl) => {
        const existing = (yEl.get('groupId') as string) || ''
        if (existing.split(',').includes(groupId)) {
          const remaining = existing.split(',').filter(g => g !== groupId).join(',')
          yEl.set('groupId', remaining)
        }
      })
    })
  }, [yElements, doc])

  const setLastUsedStyle = useCallback((fill: string, stroke: string) => {
    lastUsedStyleRef.current = { fill, stroke }
  }, [])

  return {
    elements, addShape, addPath, addLine, addArrow, addText, addImage, addFrame,
    updateElement, deleteElement, undo, redo, stopCapturing,
    reorderElement, groupElements, ungroupElements,
    setLastUsedStyle, doc, yElements,
  }
}
