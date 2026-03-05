import type { AgentConfig } from './types'
import type { ToolDefinition } from '../tools'

export const HTML_EDITOR_TOOLS: ToolDefinition[] = [
  {
    name: 'update_document_content',
    description: 'Replace the full HTML content of this document. The HTML should be a complete, self-contained page (include <style> tags for CSS, <script> for JS). The content is rendered in a sandboxed iframe.',
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'Complete HTML content for the document. Should be self-contained with inline styles/scripts.',
        },
      },
      required: ['html'],
    },
  },
]

export function buildHtmlEditorConfig(currentHtml: string | null): AgentConfig {
  const contentDesc = currentHtml
    ? `The document currently contains the following HTML:\n\`\`\`html\n${currentHtml.slice(0, 8000)}\n\`\`\``
    : 'The document is currently empty.'

  return {
    name: 'html_editor',
    systemPrompt: `You are an HTML artifact editor. You create and edit self-contained HTML documents that render in an iframe.

${contentDesc}

## Rules
- Use update_document_content to set or replace the HTML
- The HTML must be self-contained: inline <style> for CSS, <script> for JS
- Create visually polished, modern designs — not bare HTML
- Use clean semantic HTML5
- When editing existing content, preserve the overall structure and make targeted changes
- If the user asks you to build something from scratch, create a complete, working page
- For interactive elements, use vanilla JS (no frameworks available in the sandbox)
- Optimize for visual appeal: good typography, spacing, colors, subtle shadows/gradients`,
    tools: HTML_EDITOR_TOOLS,
    maxTurns: 3,
    vqa: false,
  }
}
