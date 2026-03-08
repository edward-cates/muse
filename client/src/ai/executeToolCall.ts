import type { ShapeType, CanvasElement, LineType } from '../types'
import { isShape } from '../types'
import { validateHexColor, clampDimensions, checkOverlaps } from './validation'
import { describeElement, describeConnections } from './systemPrompt'

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
  addImage?: (x: number, y: number, w: number, h: number, src: string) => string
  addWebCard?: (x: number, y: number, w: number, h: number, url: string, title: string, snippet: string) => string
  addDocumentCard?: (x: number, y: number, w: number, h: number, documentId: string, documentType: string, title: string) => string
  addDecompositionCard?: (x: number, y: number, w: number, h: number, topic: string, summary: string, lineRanges: number[], color: string, documentId: string) => string
  updateElement: (id: string, updates: Record<string, unknown>) => void
  deleteElement: (id: string) => void
  getElements: () => CanvasElement[]
  fitToContent?: () => void
  fitToElements?: (ids: string[]) => void
  // Document API functions (require auth)
  createDocument?: (opts: { title?: string; type?: string }) => Promise<{ id: string; type: string; content_version: number }>
  updateDocumentContent?: (documentId: string, content: string) => Promise<number>
  // Write elements to a remote canvas document (for research sub-canvases)
  addRemoteElements?: (documentId: string, elements: Array<Record<string, string | number | number[]>>) => Promise<{ ids: string[]; count: number }>
  // Update an element in a remote canvas document
  updateRemoteElement?: (documentId: string, elementId: string, updates: Record<string, string | number | number[]>) => Promise<void>
}

export interface FetchUrlFn {
  (url: string): Promise<{ title: string; text: string; url: string }>
}

export interface DecomposeTextFn {
  (text: string, title?: string): Promise<{ documentId: string; topics: Array<{ title: string; summary: string; color: string; lineRanges: Array<{ start: number; end: number }> }> }>
}

export interface GenerateImageFn {
  (prompt: string, size?: string): Promise<{ url: string; revised_prompt?: string }>
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
  decomposeText?: DecomposeTextFn,
  generateImage?: GenerateImageFn,
): Promise<{ tool_use_id: string; content: string }> {
  try {
    const elements = actions.getElements()

    switch (call.name) {
      case 'list_elements': {
        const listing = elements.length > 0
          ? elements.map(describeElement).join('\n')
          : '(empty canvas)'
        const connections = describeConnections(elements)
        return { tool_use_id: call.id, content: listing + connections }
      }

      case 'add_shape': {
        const { shape_type, x, y, width, height, text, fill, stroke, strokeWidth, target_document_id } = call.input as {
          shape_type: string; x: number; y: number; width: number; height: number
          text?: string; fill?: string; stroke?: string; strokeWidth?: number; target_document_id?: string
        }

        // If targeting a child canvas, write remotely via server API
        if (target_document_id && actions.addRemoteElements) {
          const elData: Record<string, string | number | number[]> = {
            type: shape_type, x, y, width: Math.max(20, width), height: Math.max(20, height), opacity: 100,
          }
          if (text !== undefined) elData.text = text
          if (fill !== undefined) elData.fill = fill
          if (stroke !== undefined) elData.stroke = stroke
          if (strokeWidth !== undefined) elData.strokeWidth = strokeWidth
          const result = await actions.addRemoteElements(target_document_id, [elData])
          return { tool_use_id: call.id, content: JSON.stringify({ id: result.ids[0], target_document_id, success: true, message: `Created ${shape_type} in child canvas` }) }
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
        const { id, target_document_id, ...updates } = call.input as { id: string; target_document_id?: string; [key: string]: unknown }
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

        // If targeting a child canvas, update remotely via server API
        if (target_document_id && actions.updateRemoteElement) {
          await actions.updateRemoteElement(target_document_id, id, updates as Record<string, string | number | number[]>)
          const result = warnings.length > 0
            ? { success: true, target_document_id, warnings }
            : { success: true, target_document_id }
          return { tool_use_id: call.id, content: JSON.stringify(result) }
        }

        const resolved = resolveShape(elements, id) || findElement(elements, id)
        if (!resolved) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: `Element "${id}" not found. Available IDs: ${elements.map(e => e.id.slice(0, 8)).join(', ')}` }) }
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
          target_document_id,
        } = call.input as {
          start_shape_id?: string; end_shape_id?: string
          start_x?: number; start_y?: number; end_x?: number; end_y?: number
          arrowStart?: boolean; arrowEnd?: boolean
          lineType?: string; stroke?: string; strokeWidth?: number
          target_document_id?: string
        }

        // If targeting a child canvas, write remotely via server API
        if (target_document_id && actions.addRemoteElements) {
          const elData: Record<string, string | number | number[]> = {
            type: 'line',
            startShapeId: start_shape_id || '', endShapeId: end_shape_id || '',
            startAnchor: 'right', endAnchor: 'left',
            startX: start_x ?? 0, startY: start_y ?? 0,
            endX: end_x ?? 0, endY: end_y ?? 0,
            lineType: lineType || 'straight',
            arrowStart: arrowStart ? 1 : 0,
            arrowEnd: arrowEnd !== false ? 1 : 0,
            opacity: 100,
          }
          if (stroke !== undefined) elData.stroke = stroke
          if (strokeWidth !== undefined) elData.strokeWidth = strokeWidth
          const result = await actions.addRemoteElements(target_document_id, [elData])
          return { tool_use_id: call.id, content: JSON.stringify({ id: result.ids[0], target_document_id, success: true }) }
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
        const { x, y, width = 280, height = 160, url, title, snippet, content, sourceType = 'manual', target_document_id } = call.input as {
          x: number; y: number; width?: number; height?: number
          url: string; title: string; snippet: string
          content?: string; sourceType?: string; target_document_id?: string
        }

        // If targeting a child canvas, write remotely via server API
        if (target_document_id && actions.addRemoteElements) {
          const elData: Record<string, string | number | number[]> = {
            type: 'webcard', x, y, width, height, url, title, snippet,
            faviconUrl: '', sourceType, opacity: 100,
          }
          if (content) elData.content = content.slice(0, 5000)
          const result = await actions.addRemoteElements(target_document_id, [elData])
          return { tool_use_id: call.id, content: JSON.stringify({ id: result.ids[0], target_document_id, success: true, message: `Created web card "${title}" in research canvas` }) }
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

      case 'add_node': {
        if (!actions.createDocument || !actions.addDocumentCard) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Document creation not available' }) }
        }
        const { title = 'Untitled', x = 100, y = 100, width = 280, height = 180 } = call.input as {
          title?: string; x?: number; y?: number; width?: number; height?: number
        }
        const doc = await actions.createDocument({ title, type: 'canvas' })
        const cardId = actions.addDocumentCard(x, y, width, height, doc.id, 'canvas', title)
        return { tool_use_id: call.id, content: JSON.stringify({ documentId: doc.id, cardElementId: cardId, success: true, message: `Created canvas node "${title}"` }) }
      }

      case 'create_document': {
        if (!actions.createDocument || !actions.updateDocumentContent || !actions.addDocumentCard) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Document creation not available' }) }
        }
        const { title, html, x = 100, y = 100, width = 280, height = 180 } = call.input as {
          title: string; html?: string; x?: number; y?: number; width?: number; height?: number
        }
        const doc = await actions.createDocument({ title, type: 'html_artifact' })
        if (html) {
          await actions.updateDocumentContent(doc.id, html)
        }
        const cardId = actions.addDocumentCard(x, y, width, height, doc.id, 'html_artifact', title)
        return { tool_use_id: call.id, content: JSON.stringify({ documentId: doc.id, cardElementId: cardId, success: true, message: `Created HTML artifact "${title}". Use update_document_content with document_id="${doc.id}" to write the HTML content.` }) }
      }

      case 'create_markdown': {
        if (!actions.createDocument || !actions.addDocumentCard) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Document creation not available' }) }
        }
        const { title, x = 100, y = 100, width = 280, height = 180 } = call.input as {
          title: string; x?: number; y?: number; width?: number; height?: number
        }
        const doc = await actions.createDocument({ title, type: 'markdown' })
        const cardId = actions.addDocumentCard(x, y, width, height, doc.id, 'markdown', title)
        return { tool_use_id: call.id, content: JSON.stringify({ documentId: doc.id, cardElementId: cardId, success: true, message: `Created markdown document "${title}". Use update_document_content with document_id="${doc.id}" and markdown="..." to write the content.` }) }
      }

      case 'update_document_content': {
        if (!actions.updateDocumentContent) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Document update not available' }) }
        }
        const { document_id, html, markdown } = call.input as { document_id: string; html?: string; markdown?: string }
        const content = html || markdown
        if (!content) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Provide either html or markdown' }) }
        }
        const newVersion = await actions.updateDocumentContent(document_id, content)
        // Update the contentVersion on any matching canvas card
        for (const el of elements) {
          if (el.type === 'document_card' && (el as { documentId: string }).documentId === document_id) {
            actions.updateElement(el.id, { contentVersion: newVersion })
          }
        }
        return { tool_use_id: call.id, content: JSON.stringify({ success: true, content_version: newVersion }) }
      }

      case 'decompose_text': {
        if (!decomposeText) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Text decomposition not available' }) }
        }
        const { text, title, x = 100, y = 100, target_document_id } = call.input as {
          text: string; title?: string; x?: number; y?: number; target_document_id?: string
        }
        const result = await decomposeText(text, title)
        const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#64748b', '#06b6d4', '#ec4899']
        const CARD_W = 260, CARD_H = 180, GAP = 20, COLS = 3

        // Build topic pills data for the source card
        const topicLabels = result.topics.map(t => t.title).join('|')
        const topicColors = result.topics.map((t, i) => t.color || COLORS[i % COLORS.length]).join('|')

        // When targeting a remote canvas: create a source sub-canvas with decomposition cards inside,
        // then place a document card (with topic pills) on the target canvas
        if (target_document_id && actions.addRemoteElements && actions.createDocument) {
          // 1. Create a canvas doc for this source's decomposition cards
          const sourceCanvas = await actions.createDocument({ title: title || 'Untitled Research', type: 'canvas' })

          // 2. Write decomposition cards into the source canvas
          const remoteEls: Array<Record<string, string | number | number[]>> = []
          for (let i = 0; i < result.topics.length; i++) {
            const topic = result.topics[i]
            const col = i % COLS
            const row = Math.floor(i / COLS)
            const cx = 100 + col * (CARD_W + GAP)
            const cy = 100 + row * (CARD_H + GAP)
            const flatRanges = topic.lineRanges.flatMap(r => [r.start, r.end])
            const color = topic.color || COLORS[i % COLORS.length]
            remoteEls.push({
              type: 'decomposition_card', x: cx, y: cy, width: CARD_W, height: CARD_H,
              topic: topic.title, summary: topic.summary, lineRanges: flatRanges,
              color, documentId: result.documentId, expanded: 0, opacity: 100,
            })
          }
          await actions.addRemoteElements(sourceCanvas.id, remoteEls)

          // 3. Place a document card on the research canvas linking to the source canvas
          const cardEl: Record<string, string | number | number[]> = {
            type: 'document_card', x, y, width: 280, height: 220,
            documentId: sourceCanvas.id, documentType: 'research',
            title: title || 'Untitled Research',
            description: '',
            topicLabels,
            topicColors,
            contentVersion: 0, opacity: 100,
          }
          const cardResult = await actions.addRemoteElements(target_document_id, [cardEl])

          return { tool_use_id: call.id, content: JSON.stringify({
            success: true,
            sourceDocumentId: result.documentId,
            canvasDocumentId: sourceCanvas.id,
            cardElementId: cardResult.ids[0],
            topicCount: result.topics.length,
            topicLabels,
            topicColors,
            target_document_id,
            message: `Decomposed "${title || 'text'}" into ${result.topics.length} topics`,
          }) }
        }

        // Local mode: write decomposition cards directly on the current canvas
        if (!actions.addDecompositionCard) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Text decomposition not available' }) }
        }
        const cardIds: string[] = []
        for (let i = 0; i < result.topics.length; i++) {
          const topic = result.topics[i]
          const col = i % COLS
          const row = Math.floor(i / COLS)
          const cx = x + col * (CARD_W + GAP)
          const cy = y + row * (CARD_H + GAP)
          const flatRanges = topic.lineRanges.flatMap(r => [r.start, r.end])
          const color = topic.color || COLORS[i % COLORS.length]
          const id = actions.addDecompositionCard(cx, cy, CARD_W, CARD_H, topic.title, topic.summary, flatRanges, color, result.documentId)
          cardIds.push(id)
        }

        return { tool_use_id: call.id, content: JSON.stringify({
          success: true,
          documentId: result.documentId,
          topicCount: result.topics.length,
          cardIds,
          message: `Decomposed "${title || 'text'}" into ${result.topics.length} topics`,
        }) }
      }

      case 'generate_image': {
        if (!generateImage || !actions.addImage) {
          return { tool_use_id: call.id, content: JSON.stringify({ error: 'Image generation not available' }) }
        }
        const { prompt, x = 100, y = 100, width = 512, height = 512, size } = call.input as {
          prompt: string; x?: number; y?: number; width?: number; height?: number; size?: string
        }
        const result = await generateImage(prompt, size)
        const id = actions.addImage(x, y, width, height, result.url)
        return {
          tool_use_id: call.id,
          content: JSON.stringify({
            id, url: result.url, revised_prompt: result.revised_prompt,
            success: true, message: `Generated image at (${x}, ${y}) ${width}×${height}`,
          }),
        }
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
