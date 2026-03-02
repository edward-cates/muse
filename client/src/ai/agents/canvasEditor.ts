import type { AgentConfig } from './types'
import type { CanvasElement } from '../../types'
import { CANVAS_TOOLS } from '../tools'
import { buildSystemPrompt } from '../systemPrompt'

export function buildCanvasEditorConfig(elements: CanvasElement[]): AgentConfig {
  return {
    name: 'canvas_editor',
    systemPrompt: buildSystemPrompt(elements),
    tools: CANVAS_TOOLS,
    maxTurns: 5,
    vqa: true,
  }
}
