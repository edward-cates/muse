import type { ShapeType } from '../types'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ElementActions {
  addShape: (type: ShapeType, x: number, y: number, w: number, h: number) => string
  addLine: (startShapeId: string, endShapeId: string, startAnchorX: number, startAnchorY: number, endAnchorX: number, endAnchorY: number) => string
  updateElement: (id: string, updates: Record<string, unknown>) => void
  deleteElement: (id: string) => void
}

export function executeToolCall(
  call: ToolCall,
  actions: ElementActions,
): { tool_use_id: string; content: string } {
  try {
    switch (call.name) {
      case 'add_shape': {
        const { shape_type, x, y, width, height, text, stroke } = call.input as {
          shape_type: string; x: number; y: number; width: number; height: number
          text?: string; stroke?: string
        }
        const id = actions.addShape(shape_type as ShapeType, x, y, width, height)
        const updates: Record<string, unknown> = {}
        if (text !== undefined) updates.text = text
        if (stroke !== undefined) updates.stroke = stroke
        if (Object.keys(updates).length > 0) actions.updateElement(id, updates)
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true }) }
      }

      case 'update_element': {
        const { id, ...updates } = call.input as { id: string; [key: string]: unknown }
        actions.updateElement(id, updates)
        return { tool_use_id: call.id, content: JSON.stringify({ success: true }) }
      }

      case 'delete_element': {
        const { id } = call.input as { id: string }
        actions.deleteElement(id)
        return { tool_use_id: call.id, content: JSON.stringify({ success: true }) }
      }

      case 'add_line': {
        const { start_shape_id, end_shape_id, start_anchor_x, start_anchor_y, end_anchor_x, end_anchor_y } = call.input as {
          start_shape_id: string; end_shape_id: string
          start_anchor_x?: number; start_anchor_y?: number
          end_anchor_x?: number; end_anchor_y?: number
        }
        const id = actions.addLine(
          start_shape_id, end_shape_id,
          start_anchor_x ?? 1, start_anchor_y ?? 0.5,
          end_anchor_x ?? 0, end_anchor_y ?? 0.5,
        )
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true }) }
      }

      default:
        return { tool_use_id: call.id, content: JSON.stringify({ error: `Unknown tool: ${call.name}` }) }
    }
  } catch (err) {
    return {
      tool_use_id: call.id,
      content: JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' }),
    }
  }
}
