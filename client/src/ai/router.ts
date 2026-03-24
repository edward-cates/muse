export type AgentIntent = 'canvas_edit' | 'research' | 'compose' | 'chat'

const RESEARCH_KEYWORDS = [
  'search', 'find', 'look up', 'lookup', 'research', 'what is', 'what are',
  'who is', 'who are', 'learn about', 'articles', 'sources', 'investigate',
  'explore topic', 'summarize', 'fetch', 'read this', 'read the',
  'decompose', 'break down', 'break this down', 'analyze this', 'ingest',
]

const CANVAS_KEYWORDS = [
  'draw', 'create', 'add', 'delete', 'remove', 'move', 'connect',
  'layout', 'arrange', 'diagram', 'flowchart', 'shape', 'box', 'circle',
  'arrow', 'mind map', 'organize', 'place', 'position', 'resize',
  'update', 'change', 'modify', 'rename', 'label', 'color',
  'wireframe', 'sketch', 'design', 'build', 'make',
  'tree', 'graph', 'chart', 'dashboard', 'grid',
  'table', 'hierarchy', 'architecture',
  'generate image', 'generated image', 'image of', 'picture of',
  'generate a', 'make an image', 'make a picture', 'dall-e', 'dalle',
  'markdown', 'wireframe', 'html artifact', 'document',
]

const URL_RE = /https?:\/\/[^\s]+/i

const VALID_INTENTS: readonly AgentIntent[] = ['canvas_edit', 'research', 'compose', 'chat']

/** Keyword-based intent heuristic (synchronous fallback) */
export function classifyIntentLocal(message: string, previousIntent?: AgentIntent): AgentIntent {
  const lower = message.toLowerCase().trim()

  // URL-only or URL + short instruction → research
  if (URL_RE.test(message)) {
    const withoutUrls = message.replace(URL_RE, '').trim()
    if (withoutUrls.length < 30) return 'research'
  }

  let researchScore = 0
  let canvasScore = 0

  for (const kw of RESEARCH_KEYWORDS) {
    if (lower.includes(kw)) researchScore++
  }
  for (const kw of CANVAS_KEYWORDS) {
    if (lower.includes(kw)) canvasScore++
  }

  // Both research and canvas signals → compose (unified agent)
  if (researchScore > 0 && canvasScore > 0) return 'compose'
  if (researchScore > canvasScore) return 'research'
  if (canvasScore > 0) return 'canvas_edit'

  // No keywords matched — continue previous intent if available
  if (previousIntent && previousIntent !== 'chat') return previousIntent
  return 'chat'
}

/** LLM-based intent classification with keyword fallback */
export async function classifyIntent(
  message: string,
  token: string,
  signal?: AbortSignal,
  previousIntent?: AgentIntent,
): Promise<AgentIntent> {
  try {
    const res = await fetch('/api/ai/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, previousIntent }),
      signal,
    })

    if (!res.ok) return classifyIntentLocal(message, previousIntent)

    const data = await res.json() as { intent?: string }
    if (data.intent && VALID_INTENTS.includes(data.intent as AgentIntent)) {
      return data.intent as AgentIntent
    }
    return classifyIntentLocal(message, previousIntent)
  } catch {
    return classifyIntentLocal(message, previousIntent)
  }
}
