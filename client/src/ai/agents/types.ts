import type { ToolDefinition } from '../tools'

export interface AgentConfig {
  name: string
  systemPrompt: string
  tools: ToolDefinition[]
  /** Anthropic-native tools (e.g. web_search) to include */
  nativeTools?: Array<{ type: string; name: string; max_uses?: number }>
  maxTurns: number
  /** Take a canvas screenshot after each tool turn and send it back to the AI for verification */
  vqa?: boolean
}
