import { createClient } from '@supabase/supabase-js'
import * as Y from 'yjs'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export function setupPersistence() {
  const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function drawingId(docName: string) {
    return docName.replace(/^muse-/, '')
  }

  function persistDoc(docName: string, ydoc: Y.Doc) {
    const existing = writeTimers.get(docName)
    if (existing) clearTimeout(existing)
    writeTimers.set(
      docName,
      setTimeout(async () => {
        writeTimers.delete(docName)
        const state = Y.encodeStateAsUpdate(ydoc)
        await getSupabase()
          .from('drawings')
          .update({ content: Buffer.from(state).toString('base64') })
          .eq('id', drawingId(docName))
      }, 500),
    )
  }

  return {
    provider: null,
    bindState: async (docName: string, ydoc: Y.Doc) => {
      const { data } = await getSupabase()
        .from('drawings')
        .select('content')
        .eq('id', drawingId(docName))
        .single()

      if (data?.content) {
        const bytes = Buffer.from(data.content, 'base64')
        Y.applyUpdate(ydoc, new Uint8Array(bytes))
      }

      ydoc.on('update', () => persistDoc(docName, ydoc))
    },
    writeState: async (docName: string, ydoc: Y.Doc) => {
      const existing = writeTimers.get(docName)
      if (existing) clearTimeout(existing)
      writeTimers.delete(docName)

      const state = Y.encodeStateAsUpdate(ydoc)
      await getSupabase()
        .from('drawings')
        .update({ content: Buffer.from(state).toString('base64') })
        .eq('id', drawingId(docName))
    },
  }
}
