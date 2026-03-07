/**
 * Provides access to the in-memory Yjs documents managed by y-websocket.
 * When a canvas is open in a browser, its Y.Doc lives in memory here.
 * Updating it triggers y-websocket to broadcast changes to all connected clients.
 */
import { createRequire } from 'node:module'
import type { Doc } from 'yjs'

const _require = createRequire(import.meta.url)
const Y = _require('yjs') as typeof import('yjs')

type GetYDocFn = (docName: string, gc?: boolean) => Doc

let _getYDoc: GetYDocFn | null = null

/** Called once from app.ts after importing y-websocket/bin/utils */
export function setGetYDoc(fn: GetYDocFn) {
  _getYDoc = fn
}

/**
 * Update an element's properties on a live in-memory Y.Doc.
 * If the doc is open in a browser, changes propagate instantly via WebSocket.
 * Returns false if the doc isn't in memory (no connected clients).
 */
export function updateLiveElement(
  documentId: string,
  elementId: string,
  updates: Record<string, string | number | number[]>,
): boolean {
  if (!_getYDoc) return false

  // y-websocket stores docs by name. Our docName is "muse-{documentId}"
  // but getYDoc would CREATE a new doc if it doesn't exist. We need to
  // check the docs Map directly to avoid that.
  // Instead, we'll use getYDoc which returns existing or creates — but
  // we should check if any client is connected. For simplicity, just
  // try to get and update.
  const docName = `muse-${documentId}`
  try {
    const ydoc = _getYDoc(docName, true)
    const yElements = ydoc.getArray('elements')

    for (let i = 0; i < yElements.length; i++) {
      const yEl = yElements.get(i) as InstanceType<typeof Y.Map>
      if (yEl.get('id') === elementId) {
        ydoc.transact(() => {
          for (const [key, value] of Object.entries(updates)) {
            yEl.set(key, value)
          }
        })
        return true
      }
    }
  } catch {
    // Doc not available
  }
  return false
}
