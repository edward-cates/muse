import type { ToolDefinition } from '../tools'

export interface AgentConfig {
  name: string
  systemPrompt: string
  tools: ToolDefinition[]
  /** Anthropic-native tools (e.g. web_search) to include */
  nativeTools?: Array<{ type: string; name: string; max_uses?: number }>
  maxTurns: number
}
