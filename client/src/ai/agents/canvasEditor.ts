import type { AgentConfig } from './types'
import type { CanvasElement } from '../../types'
import { CANVAS_TOOLS, DOCUMENT_TOOLS, IMAGE_TOOLS } from '../tools'
import { buildSystemPrompt } from '../systemPrompt'

export function buildCanvasEditorConfig(elements: CanvasElement[]): AgentConfig {
  return {
    name: 'canvas_editor',
    systemPrompt: buildSystemPrompt(elements),
    tools: [...CANVAS_TOOLS, ...DOCUMENT_TOOLS, ...IMAGE_TOOLS],
    maxTurns: 6,
    vqa: true,
  }
}
