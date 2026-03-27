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
let _docsMap: Map<string, Doc> | null = null

/** Called once from app.ts after importing y-websocket/bin/utils */
export function setGetYDoc(fn: GetYDocFn) {
  _getYDoc = fn
}

/** Called once from app.ts to pass the y-websocket docs Map */
export function setDocsMap(docs: Map<string, Doc>) {
  _docsMap = docs
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
  if (!_docsMap) return false

  // Only update docs that already exist in memory (have active WS connections).
  // Do NOT call getYDoc() here — it would create an orphan doc that never gets
  // cleaned up, leaking memory.
  const docName = `muse-${documentId}`
  const ydoc = _docsMap.get(docName)
  if (!ydoc) return false

  try {
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
