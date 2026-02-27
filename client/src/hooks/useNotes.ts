import { useEffect, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { doc } from '../collab/provider'

export interface Note {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
}

const yNotes = doc.getArray<Y.Map<string | number>>('notes')

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])

  useEffect(() => {
    const sync = () => {
      setNotes(
        yNotes.toArray().map((m) => ({
          id: m.get('id') as string,
          x: m.get('x') as number,
          y: m.get('y') as number,
          width: m.get('width') as number,
          height: m.get('height') as number,
          text: m.get('text') as string,
          color: m.get('color') as string,
        })),
      )
    }

    yNotes.observeDeep(sync)
    sync()
    return () => yNotes.unobserveDeep(sync)
  }, [])

  const addNote = useCallback((x: number, y: number, color: string) => {
    const yNote = new Y.Map<string | number>()
    yNote.set('id', crypto.randomUUID())
    yNote.set('x', x)
    yNote.set('y', y)
    yNote.set('width', 200)
    yNote.set('height', 160)
    yNote.set('text', '')
    yNote.set('color', color)
    yNotes.push([yNote])
  }, [])

  const updateNote = useCallback(
    (id: string, updates: Partial<Omit<Note, 'id'>>) => {
      yNotes.forEach((yNote) => {
        if (yNote.get('id') === id) {
          for (const [key, value] of Object.entries(updates)) {
            yNote.set(key, value)
          }
        }
      })
    },
    [],
  )

  const deleteNote = useCallback((id: string) => {
    const idx = yNotes.toArray().findIndex((n) => n.get('id') === id)
    if (idx !== -1) yNotes.delete(idx, 1)
  }, [])

  return { notes, addNote, updateNote, deleteNote }
}
