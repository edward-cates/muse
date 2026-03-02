import type { ShapeType, CanvasElement, LineType } from '../types'
import { isShape } from '../types'
import { validateHexColor, clampDimensions, checkOverlaps } from './validation'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ElementActions {
  addShape: (type: ShapeType, x: number, y: number, w: number, h: number) => string
  addLine: (startShapeId: string, endShapeId: string, lineType?: LineType) => string
  addArrow: (startShapeId: string, endShapeId: string, startX: number, startY: number, endX: number, endY: number, lineType?: LineType) => string
  addText: (x: number, y: number) => string
  addWebCard?: (x: number, y: number, w: number, h: number, url: string, title: string, snippet: string) => string
  updateElement: (id: string, updates: Record<string, unknown>) => void
  deleteElement: (id: string) => void
  getElements: () => CanvasElement[]
  fitToContent?: () => void
  fitToElements?: (ids: string[]) => void
}

export interface FetchUrlFn {
  (url: string): Promise<{ title: string; text: string; url: string }>
}

function findElement(elements: CanvasElement[], id: string): CanvasElement | undefined {
  return elements.find(el => el.id === id)
}

/**
 * Flexible shape lookup: tries exact ID → prefix match (8+ chars only).
 * The model should reference shapes by full UUID or the 8-char short ID
 * shown in the system prompt (e.g. Shape<82d47c83>).
 */
export function resolveShape(elements: CanvasElement[], ref: string): CanvasElement | undefined {
  if (!ref) return undefined
  // 1. Exact ID match
  const exact = elements.find(el => el.id === ref)
  if (exact) return exact
  // 2. Prefix match — only for 8+ char refs to avoid collisions with short strings
  if (ref.length >= 8 && ref.length < 36) {
    const prefix = elements.find(el => el.id.startsWith(ref))
    if (prefix) return prefix
  }
  return undefined
}

export async function executeToolCall(
  call: ToolCall,
  actions: ElementActions,
  fetchUrl?: FetchUrlFn,
): Promise<{ tool_use_id: string; content: string }> {
  try {
    const elements = actions.getElements()

    switch (call.name) {
      case 'add_shape': {
        const { shape_type, x, y, width, height, text, fill, stroke, strokeWidth } = call.input as {
          shape_type: string; x: number; y: number; width: number; height: number
          text?: string; fill?: string; stroke?: string; strokeWidth?: number
        }
        const warnings: string[] = []

        const dims = clampDimensions(width, height)
        if (dims.warning) warnings.push(dims.warning)

        const id = actions.addShape(shape_type as ShapeType, x, y, dims.width, dims.height)
        const updates: Record<string, unknown> = {}
        if (text !== undefined) updates.text = text
        if (fill !== undefined) {
          const v = validateHexColor(fill)
          updates.fill = v.normalized
          if (v.warning) warnings.push(v.warning)
        }
        if (stroke !== undefined) {
          const v = validateHexColor(stroke)
          updates.stroke = v.normalized
          if (v.warning) warnings.push(v.warning)
        }
        if (strokeWidth !== undefined) updates.strokeWidth = strokeWidth
        if (Object.keys(updates).length > 0) actions.updateElement(id, updates)

        const overlaps = checkOverlaps(x, y, dims.width, dims.height, elements)
        warnings.push(...overlaps)

        const msg = `Created ${shape_type} ${id.slice(0, 8)} at (${x}, ${y}) ${dims.width}×${dims.height}`
        const result = warnings.length > 0
          ? { id, success: true, message: msg, warnings }
          : { id, success: true, message: msg }
        return { tool_use_id: call.id, content: JSON.stringify(result) }
      }

      case 'add_text': {
        const { x, y, text, fontSize } = call.input as {
          x: number; y: number; text: string; fontSize?: number
        }
        const id = actions.addText(x, y)
        const updates: Record<string, unknown> = { text }
        if (fontSize !== undefined) updates.fontSize = fontSize
        actions.updateElement(id, updates)
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, message: `Created text at (${x}, ${y})` }) }
      }

      case 'update_element': {
        const { id, ...updates } = call.input as { id: string; [key: string]: unknown }
        const resolved = resolveShape(elements, id) || findElement(elements, id)
        if (!resolved) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: `Element "${id}" not found. Available IDs: ${elements.map(e => e.id.slice(0, 8)).join(', ')}` }) }
        }
        const warnings: string[] = []
        if (updates.fill !== undefined) {
          const v = validateHexColor(updates.fill as string)
          updates.fill = v.normalized
          if (v.warning) warnings.push(v.warning)
        }
        if (updates.stroke !== undefined) {
          const v = validateHexColor(updates.stroke as string)
          updates.stroke = v.normalized
          if (v.warning) warnings.push(v.warning)
        }
        actions.updateElement(resolved.id, updates)
        const result = warnings.length > 0
          ? { success: true, warnings }
          : { success: true }
        return { tool_use_id: call.id, content: JSON.stringify(result) }
      }

      case 'delete_element': {
        const { id } = call.input as { id: string }
        const resolved = resolveShape(elements, id) || findElement(elements, id)
        if (!resolved) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: `Element "${id}" not found` }) }
        }
        actions.deleteElement(resolved.id)
        return { tool_use_id: call.id, content: JSON.stringify({ success: true }) }
      }

      case 'add_line': {
        const { start_shape_id, end_shape_id, lineType, stroke, strokeWidth } = call.input as {
          start_shape_id: string; end_shape_id: string
          lineType?: string; stroke?: string; strokeWidth?: number
        }
        const startEl = resolveShape(elements, start_shape_id)
        if (!startEl) return { tool_use_id: call.id, content: JSON.stringify({ error: `Start shape "${start_shape_id}" not found. Available: ${elements.filter(e => isShape(e)).map(e => `${e.id.slice(0,8)}${isShape(e) && e.text ? ' "'+e.text+'"' : ''}`).join(', ')}` }) }
        const endEl = resolveShape(elements, end_shape_id)
        if (!endEl) return { tool_use_id: call.id, content: JSON.stringify({ error: `End shape "${end_shape_id}" not found. Available: ${elements.filter(e => isShape(e)).map(e => `${e.id.slice(0,8)}${isShape(e) && e.text ? ' "'+e.text+'"' : ''}`).join(', ')}` }) }

        const id = actions.addLine(
          startEl.id, endEl.id,
          (lineType as LineType) || 'straight',
        )
        const updates: Record<string, unknown> = {}
        if (stroke !== undefined) {
          const v = validateHexColor(stroke)
          updates.stroke = v.normalized
        }
        if (strokeWidth !== undefined) updates.strokeWidth = strokeWidth
        if (Object.keys(updates).length > 0) actions.updateElement(id, updates)

        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true }) }
      }

      case 'add_arrow': {
        const {
          start_shape_id, end_shape_id,
          start_x, start_y, end_x, end_y,
          arrowStart, arrowEnd, lineType, stroke, strokeWidth,
        } = call.input as {
          start_shape_id?: string; end_shape_id?: string
          start_x?: number; start_y?: number; end_x?: number; end_y?: number
          arrowStart?: boolean; arrowEnd?: boolean
          lineType?: string; stroke?: string; strokeWidth?: number
        }

        const startResolved = start_shape_id ? resolveShape(elements, start_shape_id) : undefined
        const endResolved = end_shape_id ? resolveShape(elements, end_shape_id) : undefined
        const sId = startResolved?.id || ''
        const eId = endResolved?.id || ''

        const id = actions.addArrow(
          sId, eId,
          start_x ?? 0, start_y ?? 0,
          end_x ?? 0, end_y ?? 0,
          (lineType as LineType) || 'straight',
        )
        const updates: Record<string, unknown> = {}
        if (arrowStart !== undefined) updates.arrowStart = arrowStart
        if (arrowEnd !== undefined) updates.arrowEnd = arrowEnd
        if (stroke !== undefined) {
          const v = validateHexColor(stroke)
          updates.stroke = v.normalized
        }
        if (strokeWidth !== undefined) updates.strokeWidth = strokeWidth
        if (Object.keys(updates).length > 0) actions.updateElement(id, updates)

        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true }) }
      }

      case 'arrange_grid': {
        const { element_ids, columns, start_x = 100, start_y = 100, gap_x = 40, gap_y = 40 } = call.input as {
          element_ids: string[]; columns?: number; start_x?: number; start_y?: number
          gap_x?: number; gap_y?: number
        }
        const cols = columns || Math.ceil(Math.sqrt(element_ids.length))
        let moved = 0
        for (let i = 0; i < element_ids.length; i++) {
          const el = resolveShape(elements, element_ids[i]) || findElement(elements, element_ids[i])
          if (!el) continue
          const col = i % cols
          const row = Math.floor(i / cols)
          const elW = isShape(el) ? el.width : 160
          const elH = isShape(el) ? el.height : 80
          const x = start_x + col * (elW + gap_x)
          const y = start_y + row * (elH + gap_y)
          actions.updateElement(el.id, { x, y })
          moved++
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, moved, columns: cols }) }
      }

      case 'arrange_flow': {
        const { element_ids, direction = 'vertical', start_x = 100, start_y = 100, gap = 60 } = call.input as {
          element_ids: string[]; direction?: string; start_x?: number; start_y?: number; gap?: number
        }
        let cx = start_x, cy = start_y
        let moved = 0
        for (const eid of element_ids) {
          const el = resolveShape(elements, eid) || findElement(elements, eid)
          if (!el) continue
          actions.updateElement(el.id, { x: cx, y: cy })
          const elW = isShape(el) ? el.width : 160
          const elH = isShape(el) ? el.height : 80
          if (direction === 'horizontal') cx += elW + gap
          else cy += elH + gap
          moved++
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, moved, direction }) }
      }

      case 'set_viewport': {
        const { mode, element_ids } = call.input as { mode: string; element_ids?: string[] }
        if (mode === 'fit_all') {
          if (!actions.fitToContent) {
            return { tool_use_id: call.id, content: JSON.stringify({ error: 'Viewport control not available' }) }
          }
          actions.fitToContent()
          return { tool_use_id: call.id, content: JSON.stringify({ success: true, message: 'Viewport fitted to all content' }) }
        }
        if (mode === 'fit_elements') {
          if (!actions.fitToElements) {
            return { tool_use_id: call.id, content: JSON.stringify({ error: 'Viewport control not available' }) }
          }
          if (!element_ids || element_ids.length === 0) {
            return { tool_use_id: call.id, content: JSON.stringify({ error: 'element_ids required for fit_elements mode' }) }
          }
          const resolvedIds: string[] = []
          for (const eid of element_ids) {
            const el = resolveShape(elements, eid) || findElement(elements, eid)
            if (el) resolvedIds.push(el.id)
          }
          if (resolvedIds.length === 0) {
            return { tool_use_id: call.id, content: JSON.stringify({ error: 'No matching elements found' }) }
          }
          actions.fitToElements(resolvedIds)
          return { tool_use_id: call.id, content: JSON.stringify({ success: true, message: `Viewport fitted to ${resolvedIds.length} elements` }) }
        }
        return { tool_use_id: call.id, content: JSON.stringify({ error: `Unknown viewport mode: ${mode}` }) }
      }

      case 'add_web_card': {
        const { x, y, width = 280, height = 160, url, title, snippet, content, sourceType = 'manual' } = call.input as {
          x: number; y: number; width?: number; height?: number
          url: string; title: string; snippet: string
          content?: string; sourceType?: string
        }
        if (!actions.addWebCard) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'WebCard creation not available' }) }
        }
        const id = actions.addWebCard(x, y, width, height, url, title, snippet)
        const updates: Record<string, unknown> = {}
        if (content) updates.content = content.slice(0, 5000)
        if (sourceType) updates.sourceType = sourceType
        if (Object.keys(updates).length > 0) actions.updateElement(id, updates)
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, message: `Created web card "${title}" at (${x}, ${y})` }) }
      }

      case 'fetch_url': {
        if (!fetchUrl) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'URL fetching not available' }) }
        }
        const { url } = call.input as { url: string }
        const result = await fetchUrl(url)
        return { tool_use_id: call.id, content: JSON.stringify(result) }
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
