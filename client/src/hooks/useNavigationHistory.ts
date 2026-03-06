import { useSyncExternalStore, useCallback } from 'react'

export interface HistoryEntry {
  id: string
  title: string
}

const MAX_HISTORY = 3

// Module-level state — persists across remounts within a session
let history: HistoryEntry[] = []
let listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

function getSnapshot(): HistoryEntry[] {
  return history
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Record a navigation to a document. Call this when entering a new page. */
export function recordNavigation(id: string, title: string) {
  // Don't add duplicates of the most recent entry
  if (history.length > 0 && history[history.length - 1].id === id) return
  // Remove any existing entry for this id to avoid duplicates
  history = history.filter(e => e.id !== id)
  history.push({ id, title })
  // Keep only the most recent entries (MAX_HISTORY + 1 for the current page)
  if (history.length > MAX_HISTORY + 1) {
    history = history.slice(history.length - (MAX_HISTORY + 1))
  }
  notify()
}

/** Update the title of an existing history entry (e.g. after a rename). */
export function updateHistoryTitle(id: string, title: string) {
  const entry = history.find(e => e.id === id)
  if (!entry || entry.title === title) return
  history = history.map(e => e.id === id ? { ...e, title } : e)
  notify()
}

/** Get the breadcrumb trail (excludes the current page). */
export function useNavigationHistory(currentId: string): HistoryEntry[] {
  const all = useSyncExternalStore(subscribe, getSnapshot)
  return all.filter(e => e.id !== currentId)
}

export function useNavigate() {
  return useCallback((docId: string) => {
    window.location.hash = `/d/${docId}`
  }, [])
}
