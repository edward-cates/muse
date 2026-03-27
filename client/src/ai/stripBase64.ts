/**
 * Strip base64 data URIs from tool_result content in API messages.
 * Called before each subsequent API turn so generated images are seen
 * by the model once but don't bloat the context on future turns.
 */

interface ContentBlock {
  type: string
  tool_use_id?: string
  content?: string
  [key: string]: unknown
}

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

const BASE64_URI_RE = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g

export function stripBase64FromMessages<T extends ApiMessage>(messages: T[]): T[] {
  return messages.map((msg) => {
    if (typeof msg.content === 'string' || !Array.isArray(msg.content)) return msg

    let changed = false
    const content = msg.content.map((block) => {
      if (block.type !== 'tool_result' || typeof block.content !== 'string') return block

      const stripped = block.content.replace(BASE64_URI_RE, '(image stored on canvas)')
      if (stripped !== block.content) {
        changed = true
        return { ...block, content: stripped }
      }
      return block
    })

    return changed ? { ...msg, content } : msg
  })
}
