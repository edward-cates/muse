import type { AgentConfig } from './types'
import type { CanvasElement } from '../../types'
import { CANVAS_TOOLS, DOCUMENT_TOOLS, RESEARCH_TOOLS, IMAGE_TOOLS } from '../tools'
import { buildSystemPrompt } from '../systemPrompt'
import { isWebCard } from '../../types'
import type { ToolDefinition } from '../tools'

/** Deduplicate tools by name (CANVAS_TOOLS and RESEARCH_TOOLS both have arrange_grid) */
function dedupeTools(tools: ToolDefinition[]): ToolDefinition[] {
  const seen = new Set<string>()
  return tools.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })
}

/**
 * Unified agent that combines all capabilities: canvas editing, research,
 * document creation, image generation, and web search. Use this when the
 * user's request spans multiple domains (e.g. "research X and make a diagram").
 */
export function buildComposerConfig(elements: CanvasElement[]): AgentConfig {
  const existingCards = elements.filter(isWebCard)
  const cardNote = existingCards.length > 0
    ? `\nExisting source cards on canvas:\n${existingCards.map(c => `- "${c.title}" (${c.url})`).join('\n')}\nAvoid duplicating these sources.`
    : ''

  const basePrompt = buildSystemPrompt(elements)

  const composerAddendum = `

## Research capabilities
You can search the web and create source cards to gather information before building diagrams.
- Use web_search to find relevant sources
- Use fetch_url to read specific pages
- Use add_web_card to pin sources on the canvas
- Use decompose_text to break down long documents into topic cards
${cardNote}

## Workflow
For mixed requests (e.g. "research X and create a diagram"):
1. Research first: search the web and read sources
2. Then build: create shapes, connections, documents, or images based on what you learned
3. Arrange: lay out everything neatly with arrange_grid or arrange_flow
4. Summarize: tell the user what you found and built`

  return {
    name: 'composer',
    systemPrompt: basePrompt + composerAddendum,
    tools: dedupeTools([...CANVAS_TOOLS, ...DOCUMENT_TOOLS, ...RESEARCH_TOOLS, ...IMAGE_TOOLS]),
    nativeTools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ],
    maxTurns: 10,
    vqa: true,
  }
}
