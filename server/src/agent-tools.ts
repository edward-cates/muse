import {
  addElementsToDoc,
  updateElementInDoc,
  deleteElementFromDoc,
  readElementsFromDoc,
  createDocument,
  type YMapVal,
} from './yjs-utils.js'
import crypto from 'node:crypto'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolContext {
  userId: string
  documentId: string  // the parent canvas where the job was triggered
  jobId?: string      // agent job ID — stamped onto document cards for status tracking
  fetchUrl: (url: string) => Promise<{ title: string; text: string; url: string }>
  decomposeText: (text: string, title?: string) => Promise<{
    documentId: string
    topics: Array<{ title: string; summary: string; color: string; lineRanges: Array<{ start: number; end: number }> }>
  }>
}

type ElementRecord = Record<string, YMapVal>

function resolveElement(elements: ElementRecord[], ref: string): ElementRecord | undefined {
  if (!ref) return undefined
  const exact = elements.find(el => el.id === ref)
  if (exact) return exact
  if (ref.length >= 8 && ref.length < 36) {
    return elements.find(el => (el.id as string).startsWith(ref))
  }
  return undefined
}

function isShapeType(type: string): boolean {
  return ['rectangle', 'ellipse', 'diamond'].includes(type)
}

const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#64748b', '#06b6d4', '#ec4899']

export async function executeServerToolCall(
  call: ToolCall,
  ctx: ToolContext,
): Promise<{ tool_use_id: string; content: string }> {
  try {
    switch (call.name) {
      case 'add_shape': {
        const { shape_type, x, y, width, height, text, fill, stroke, strokeWidth, target_document_id } = call.input as {
          shape_type: string; x: number; y: number; width: number; height: number
          text?: string; fill?: string; stroke?: string; strokeWidth?: number; target_document_id?: string
        }
        const targetDoc = target_document_id || ctx.documentId
        const el: ElementRecord = {
          id: crypto.randomUUID(),
          type: shape_type,
          x, y,
          width: Math.max(20, width),
          height: Math.max(20, height),
        }
        if (text !== undefined) el.text = text
        if (fill !== undefined) el.fill = fill
        if (stroke !== undefined) el.stroke = stroke
        if (strokeWidth !== undefined) el.strokeWidth = strokeWidth

        const [id] = await addElementsToDoc(targetDoc, [el])
        const msg = `Created ${shape_type} ${id.slice(0, 8)} at (${x}, ${y})`
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, message: msg, ...(target_document_id ? { target_document_id } : {}) }) }
      }

      case 'add_text': {
        const { x, y, text, fontSize } = call.input as { x: number; y: number; text: string; fontSize?: number }
        const el: ElementRecord = { id: crypto.randomUUID(), type: 'text', x, y, text }
        if (fontSize !== undefined) el.fontSize = fontSize
        const [id] = await addElementsToDoc(ctx.documentId, [el])
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true }) }
      }

      case 'add_line': {
        const { start_shape_id, end_shape_id, lineType = 'straight', stroke, strokeWidth, target_document_id } = call.input as {
          start_shape_id: string; end_shape_id: string; lineType?: string; stroke?: string; strokeWidth?: number; target_document_id?: string
        }
        const targetDoc = target_document_id || ctx.documentId
        const elements = await readElementsFromDoc(targetDoc)
        const startEl = resolveElement(elements, start_shape_id)
        const endEl = resolveElement(elements, end_shape_id)

        if (!startEl) return { tool_use_id: call.id, content: JSON.stringify({ error: `Start shape "${start_shape_id}" not found` }) }
        if (!endEl) return { tool_use_id: call.id, content: JSON.stringify({ error: `End shape "${end_shape_id}" not found` }) }

        const el: ElementRecord = {
          id: crypto.randomUUID(), type: 'line',
          startShapeId: startEl.id as string, endShapeId: endEl.id as string,
          startAnchor: 'right', endAnchor: 'left',
          startX: 0, startY: 0, endX: 0, endY: 0,
          lineType, arrowStart: 0, arrowEnd: 0,
        }
        if (stroke !== undefined) el.stroke = stroke
        if (strokeWidth !== undefined) el.strokeWidth = strokeWidth

        const [id] = await addElementsToDoc(targetDoc, [el])
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, ...(target_document_id ? { target_document_id } : {}) }) }
      }

      case 'add_arrow': {
        const {
          start_shape_id, end_shape_id, start_x, start_y, end_x, end_y,
          arrowStart, arrowEnd, lineType = 'straight', stroke, strokeWidth, target_document_id,
        } = call.input as {
          start_shape_id?: string; end_shape_id?: string
          start_x?: number; start_y?: number; end_x?: number; end_y?: number
          arrowStart?: boolean; arrowEnd?: boolean
          lineType?: string; stroke?: string; strokeWidth?: number; target_document_id?: string
        }
        const targetDoc = target_document_id || ctx.documentId

        let resolvedStartId = ''
        let resolvedEndId = ''
        if (start_shape_id || end_shape_id) {
          const elements = await readElementsFromDoc(targetDoc)
          if (start_shape_id) {
            const startEl = resolveElement(elements, start_shape_id)
            if (startEl) resolvedStartId = startEl.id as string
          }
          if (end_shape_id) {
            const endEl = resolveElement(elements, end_shape_id)
            if (endEl) resolvedEndId = endEl.id as string
          }
        }

        const el: ElementRecord = {
          id: crypto.randomUUID(), type: 'line',
          startShapeId: resolvedStartId, endShapeId: resolvedEndId,
          startAnchor: 'right', endAnchor: 'left',
          startX: start_x ?? 0, startY: start_y ?? 0,
          endX: end_x ?? 0, endY: end_y ?? 0,
          lineType,
          arrowStart: arrowStart ? 1 : 0,
          arrowEnd: arrowEnd !== false ? 1 : 0,
        }
        if (stroke !== undefined) el.stroke = stroke
        if (strokeWidth !== undefined) el.strokeWidth = strokeWidth

        const [id] = await addElementsToDoc(targetDoc, [el])
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, ...(target_document_id ? { target_document_id } : {}) }) }
      }

      case 'update_element': {
        const { id, target_document_id, ...updates } = call.input as {
          id: string; target_document_id?: string; [key: string]: unknown
        }
        const targetDoc = target_document_id || ctx.documentId

        // For local canvas, resolve the ID
        if (!target_document_id) {
          const elements = await readElementsFromDoc(targetDoc)
          const resolved = resolveElement(elements, id)
          if (!resolved) {
            return { tool_use_id: call.id, content: JSON.stringify({ error: `Element "${id}" not found` }) }
          }
          await updateElementInDoc(targetDoc, resolved.id as string, updates as Record<string, YMapVal>)
        } else {
          await updateElementInDoc(targetDoc, id, updates as Record<string, YMapVal>)
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, ...(target_document_id ? { target_document_id } : {}) }) }
      }

      case 'delete_element': {
        const { id } = call.input as { id: string }
        const elements = await readElementsFromDoc(ctx.documentId)
        const resolved = resolveElement(elements, id)
        if (!resolved) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: `Element "${id}" not found` }) }
        }
        await deleteElementFromDoc(ctx.documentId, resolved.id as string)
        return { tool_use_id: call.id, content: JSON.stringify({ success: true }) }
      }

      case 'add_web_card': {
        const { x, y, width = 280, height = 160, url, title, snippet, content, sourceType = 'manual', target_document_id } = call.input as {
          x: number; y: number; width?: number; height?: number
          url: string; title: string; snippet: string; content?: string; sourceType?: string; target_document_id?: string
        }
        const targetDoc = target_document_id || ctx.documentId
        const el: ElementRecord = {
          type: 'webcard', x, y, width, height, url, title, snippet,
          faviconUrl: '', sourceType, opacity: 100,
        }
        if (content) el.content = content.slice(0, 5000)
        const [id] = await addElementsToDoc(targetDoc, [el])
        return { tool_use_id: call.id, content: JSON.stringify({ id, success: true, message: `Created web card "${title}"`, ...(target_document_id ? { target_document_id } : {}) }) }
      }

      case 'fetch_url': {
        const { url } = call.input as { url: string }
        const result = await ctx.fetchUrl(url)
        return { tool_use_id: call.id, content: JSON.stringify(result) }
      }

      case 'add_node': {
        const { title = 'Untitled', x = 100, y = 100, width = 280, height = 180 } = call.input as {
          title?: string; x?: number; y?: number; width?: number; height?: number
        }
        const doc = await createDocument(ctx.userId, { title, type: 'canvas' })
        const el: ElementRecord = {
          type: 'document_card', x, y, width, height,
          documentId: doc.id, documentType: 'canvas',
          title, description: '', contentVersion: 0, opacity: 100,
          jobId: ctx.jobId || '', jobStatus: ctx.jobId ? 'running' : '',
        }
        const [cardId] = await addElementsToDoc(ctx.documentId, [el])
        return { tool_use_id: call.id, content: JSON.stringify({ documentId: doc.id, cardElementId: cardId, success: true, message: `Created canvas node "${title}"` }) }
      }

      case 'decompose_text': {
        const { text, title, x = 100, y = 100, target_document_id } = call.input as {
          text: string; title?: string; x?: number; y?: number; target_document_id?: string
        }
        const result = await ctx.decomposeText(text, title)
        const CARD_W = 260, CARD_H = 180, GAP = 20, COLS = 3

        const topicLabels = result.topics.map(t => t.title).join('|')
        const topicColors = result.topics.map((t, i) => t.color || COLORS[i % COLORS.length]).join('|')

        if (target_document_id) {
          // Create source sub-canvas with decomposition cards
          const sourceCanvas = await createDocument(ctx.userId, { title: title || 'Untitled Research', type: 'canvas' })

          const remoteEls: ElementRecord[] = result.topics.map((topic, i) => {
            const col = i % COLS
            const row = Math.floor(i / COLS)
            const flatRanges = topic.lineRanges.flatMap(r => [r.start, r.end])
            const color = topic.color || COLORS[i % COLORS.length]
            return {
              type: 'decomposition_card', x: 100 + col * (CARD_W + GAP), y: 100 + row * (CARD_H + GAP),
              width: CARD_W, height: CARD_H, topic: topic.title, summary: topic.summary,
              lineRanges: flatRanges, color, documentId: result.documentId, expanded: 0, opacity: 100,
            }
          })
          await addElementsToDoc(sourceCanvas.id, remoteEls)

          // Place document card on the research canvas
          const cardEl: ElementRecord = {
            type: 'document_card', x, y, width: 280, height: 220,
            documentId: sourceCanvas.id, documentType: 'research',
            title: title || 'Untitled Research', description: '',
            topicLabels, topicColors, contentVersion: 0, opacity: 100,
          }
          const [cardId] = await addElementsToDoc(target_document_id, [cardEl])

          return { tool_use_id: call.id, content: JSON.stringify({
            success: true, sourceDocumentId: result.documentId, canvasDocumentId: sourceCanvas.id,
            cardElementId: cardId, topicCount: result.topics.length, topicLabels, topicColors,
            target_document_id, message: `Decomposed "${title || 'text'}" into ${result.topics.length} topics`,
          }) }
        }

        // Local mode — add decomposition cards directly to the parent canvas
        const cardEls: ElementRecord[] = result.topics.map((topic, i) => {
          const col = i % COLS
          const row = Math.floor(i / COLS)
          const flatRanges = topic.lineRanges.flatMap(r => [r.start, r.end])
          const color = topic.color || COLORS[i % COLORS.length]
          return {
            type: 'decomposition_card', x: x + col * (CARD_W + GAP), y: y + row * (CARD_H + GAP),
            width: CARD_W, height: CARD_H, topic: topic.title, summary: topic.summary,
            lineRanges: flatRanges, color, documentId: result.documentId, expanded: 0, opacity: 100,
          }
        })
        const cardIds = await addElementsToDoc(ctx.documentId, cardEls)

        return { tool_use_id: call.id, content: JSON.stringify({
          success: true, documentId: result.documentId, topicCount: result.topics.length, cardIds,
          message: `Decomposed "${title || 'text'}" into ${result.topics.length} topics`,
        }) }
      }

      case 'arrange_grid': {
        const { element_ids, columns, start_x = 100, start_y = 100, gap_x = 40, gap_y = 40 } = call.input as {
          element_ids: string[]; columns?: number; start_x?: number; start_y?: number; gap_x?: number; gap_y?: number
        }
        const elements = await readElementsFromDoc(ctx.documentId)
        const cols = columns || Math.ceil(Math.sqrt(element_ids.length))
        let moved = 0
        for (let i = 0; i < element_ids.length; i++) {
          const el = resolveElement(elements, element_ids[i])
          if (!el) continue
          const col = i % cols
          const row = Math.floor(i / cols)
          const elW = isShapeType(el.type as string) ? (el.width as number) : 160
          const elH = isShapeType(el.type as string) ? (el.height as number) : 80
          await updateElementInDoc(ctx.documentId, el.id as string, {
            x: start_x + col * (elW + gap_x),
            y: start_y + row * (elH + gap_y),
          })
          moved++
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, moved, columns: cols }) }
      }

      case 'arrange_flow': {
        const { element_ids, direction = 'vertical', start_x = 100, start_y = 100, gap = 60 } = call.input as {
          element_ids: string[]; direction?: string; start_x?: number; start_y?: number; gap?: number
        }
        const elements = await readElementsFromDoc(ctx.documentId)
        let cx = start_x, cy = start_y
        let moved = 0
        for (const eid of element_ids) {
          const el = resolveElement(elements, eid)
          if (!el) continue
          await updateElementInDoc(ctx.documentId, el.id as string, { x: cx, y: cy })
          const elW = isShapeType(el.type as string) ? (el.width as number) : 160
          const elH = isShapeType(el.type as string) ? (el.height as number) : 80
          if (direction === 'horizontal') cx += elW + gap
          else cy += elH + gap
          moved++
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, moved, direction }) }
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
