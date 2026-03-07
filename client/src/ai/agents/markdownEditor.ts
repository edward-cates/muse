import type { AgentConfig } from './types'
import type { ToolDefinition } from '../tools'

export const MARKDOWN_EDITOR_TOOLS: ToolDefinition[] = [
  {
    name: 'update_document_content',
    description: 'Replace the full markdown content of this document. Use standard markdown syntax (headings, lists, code blocks, tables, links, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Complete markdown content for the document.',
        },
      },
      required: ['markdown'],
    },
  },
]

export function buildMarkdownEditorConfig(currentMarkdown: string | null): AgentConfig {
  const contentDesc = currentMarkdown
    ? `The document currently contains the following markdown:\n\`\`\`markdown\n${currentMarkdown.slice(0, 8000)}\n\`\`\``
    : 'The document is currently empty.'

  return {
    name: 'markdown_editor',
    systemPrompt: `You are a markdown document editor. You create and edit markdown documents.

${contentDesc}

## Rules
- Use update_document_content to set or replace the markdown
- Use standard markdown: headings (#), lists (- or 1.), code blocks (\`\`\`), tables, links, bold, italic, etc.
- Write clear, well-structured content with good use of headings and formatting
- When editing existing content, preserve the overall structure and make targeted changes
- If the user asks you to write something from scratch, create complete, well-organized content`,
    tools: MARKDOWN_EDITOR_TOOLS,
    maxTurns: 3,
    vqa: false,
  }
}
