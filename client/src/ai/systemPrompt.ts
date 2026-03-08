import type { CanvasElement } from '../types'
import { isShape, isLine, isText, isImage, isFrame, isWebCard, isDocumentCard, isDecompositionCard } from '../types'

export function describeElement(el: CanvasElement): string {
  if (isShape(el)) {
    const label = el.text ? ` "${el.text}"` : ''
    return `Shape<${el.id.slice(0, 8)}> ${el.type} at (${el.x},${el.y}) ${el.width}×${el.height} fill=${el.fill} stroke=${el.stroke}${label}`
  }
  if (isLine(el)) {
    const from = el.startShapeId ? `Shape<${el.startShapeId.slice(0, 8)}>` : `(${el.startX},${el.startY})`
    const to = el.endShapeId ? `Shape<${el.endShapeId.slice(0, 8)}>` : `(${el.endX},${el.endY})`
    const arrow = el.arrowEnd ? '→' : '—'
    return `Line<${el.id.slice(0, 8)}> ${from} ${arrow} ${to} ${el.lineType} stroke=${el.stroke}`
  }
  if (isText(el)) {
    const preview = el.text.length > 30 ? el.text.slice(0, 30) + '…' : el.text
    return `Text<${el.id.slice(0, 8)}> at (${el.x},${el.y}) "${preview}"`
  }
  if (isImage(el)) {
    return `Image<${el.id.slice(0, 8)}> at (${el.x},${el.y}) ${el.width}×${el.height}`
  }
  if (isFrame(el)) {
    return `Frame<${el.id.slice(0, 8)}> "${el.label}" at (${el.x},${el.y}) ${el.width}×${el.height}`
  }
  if (isWebCard(el)) {
    return `WebCard<${el.id.slice(0, 8)}> "${el.title}" at (${el.x},${el.y}) ${el.width}×${el.height} url=${el.url}`
  }
  if (isDocumentCard(el)) {
    return `DocCard<${el.id.slice(0, 8)}> "${el.title}" (${el.documentType}) at (${el.x},${el.y}) ${el.width}×${el.height} docId=${el.documentId}`
  }
  if (isDecompositionCard(el)) {
    const ranges = []
    for (let i = 0; i < el.lineRanges.length; i += 2) {
      ranges.push(`${el.lineRanges[i]}-${el.lineRanges[i + 1]}`)
    }
    return `DecompCard<${el.id.slice(0, 8)}> "${el.topic}" at (${el.x},${el.y}) ${el.width}×${el.height} color=${el.color} docId=${el.documentId} lines=[${ranges.join(',')}]`
  }
  return `Unknown<${el.id.slice(0, 8)}>`
}

export function describeConnections(elements: CanvasElement[]): string {
  const lines = elements.filter(isLine)
  if (lines.length === 0) return ''

  const connections: string[] = []
  for (const line of lines) {
    if (!line.startShapeId || !line.endShapeId) continue
    const from = elements.find(e => e.id === line.startShapeId)
    const to = elements.find(e => e.id === line.endShapeId)
    if (!from || !to) continue
    const fromLabel = isShape(from) && from.text ? `"${from.text}"` : from.id.slice(0, 8)
    const toLabel = isShape(to) && to.text ? `"${to.text}"` : to.id.slice(0, 8)
    const arrow = line.arrowEnd ? '→' : '—'
    connections.push(`  ${fromLabel} ${arrow} ${toLabel}`)
  }
  if (connections.length === 0) return ''
  return `\nConnections:\n${connections.join('\n')}`
}

/** Compact ID→label map for the system prompt (keeps token count low) */
function buildElementMap(elements: CanvasElement[]): string {
  if (elements.length === 0) return '(empty canvas)'
  const entries: string[] = []
  for (const el of elements) {
    const short = el.id.slice(0, 8)
    if (isShape(el)) {
      const label = el.text ? `"${el.text}"` : el.type
      entries.push(`${short}=${label}`)
    } else if (isLine(el)) {
      const from = el.startShapeId ? el.startShapeId.slice(0, 8) : '?'
      const to = el.endShapeId ? el.endShapeId.slice(0, 8) : '?'
      const arrow = el.arrowEnd ? '→' : '—'
      entries.push(`${short}=(${from}${arrow}${to})`)
    } else if (isText(el)) {
      const preview = el.text.length > 20 ? el.text.slice(0, 20) + '…' : el.text
      entries.push(`${short}="${preview}"`)
    } else if (isWebCard(el)) {
      entries.push(`${short}=WebCard:"${el.title}"`)
    } else if (isDocumentCard(el)) {
      entries.push(`${short}=Doc:"${el.title}"`)
    } else if (isDecompositionCard(el)) {
      entries.push(`${short}=Decomp:"${el.topic}"`)
    } else if (isImage(el)) {
      entries.push(`${short}=Image`)
    } else if (isFrame(el)) {
      entries.push(`${short}=Frame:"${el.label}"`)
    }
  }
  return entries.join(', ')
}

export function buildSystemPrompt(elements: CanvasElement[]): string {
  const elementMap = buildElementMap(elements)

  return `You are a spatial thinking assistant for Muse, a collaborative canvas. You can create and modify diagrams, flowcharts, mind maps, and visual layouts.

## Canvas elements (${elements.length})
${elementMap}

Use the list_elements tool to get detailed positions, sizes, and properties when needed. You also receive a screenshot each turn showing the current layout.

## Coordinate system
- Origin (0,0) is top-left. X increases right, Y increases down.
- Visible area is roughly 0-1200 horizontal, 0-800 vertical (users can pan/zoom).
- Element position (x,y) refers to the top-left corner.

## Layout templates
**Top-down flowchart**: Place shapes vertically with 60px gaps. Connect with add_line.
  Row 1: y=100, Row 2: y=240, Row 3: y=380 (assuming 80px height + 60px gap)
  Center horizontally around x=400-600.

**Left-right flow**: Place shapes horizontally with 60px gaps. Connect with add_line.
  Col 1: x=100, Col 2: x=320, Col 3: x=540 (assuming 160px width + 60px gap)

**Grid layout**: Use arrange_grid for N items. Good for comparison boards, feature lists.

**Hub-spoke / mind map**: Center node at (500,400). Spokes radiate outward at ~200px distance.
  Top: (500,200), Right: (700,400), Bottom: (500,600), Left: (300,400)
  Diagonals: (650,250), (650,550), (350,250), (350,550)

**Hierarchy / tree**: Place the root node at top-center. For each level below,
  spread children horizontally with equal spacing, centered under their parent.
  Each level should be ~150px below the previous one. Connect parent to child
  with add_line. If the tree is wide, start further left.

## Good defaults
- Rectangle: 160×80, Ellipse: 140×100, Diamond: 120×120
- Default fill: #e8edfc, Default stroke: #4465e9
- Space shapes 150-200px apart for readability
- Use descriptive text labels in shapes

## Connecting shapes
- For add_line and add_arrow, reference shapes by their ID (full UUID or first 8 chars).
- When you create shapes, each tool result returns the new shape's ID. Use those IDs in subsequent add_line/add_arrow calls.
- Create all shapes first, then add connections in the same turn using the returned IDs.

## Documents (HTML & Markdown)
- IMPORTANT: Always use a two-step process so the user sees the card immediately:
  1. Call create_document or create_markdown with just a title — this places the card on the canvas right away.
  2. Call update_document_content with the document_id and content — the card updates to show the rendered preview.
- Never pass html directly to create_document — it delays the card appearing until all HTML is generated.
- Use create_document for interactive HTML artifacts (dashboards, widgets, wireframes). HTML must be self-contained (inline <style> and <script>).
- Use create_markdown for text documents (READMEs, notes, writeups, plans). Pass markdown="..." to update_document_content.
- Document cards can be double-clicked to open in a full-page editor.

## Decomposition Cards
- DecompCard elements are topic cards created by decompose_text. They show a topic title, summary, and line references to the source document.
- You can move/resize them with update_element, delete them with delete_element.
- Use decompose_text when the user pastes a long document or asks to break down / analyze text.

## Image Generation
- Use generate_image to create AI-generated images (via DALL-E) and place them on the canvas.
- Provide a detailed prompt describing the desired image.
- Default size is 1024x1024. Use 1024x1792 for portrait, 1792x1024 for landscape.
- The image appears as an Image element on the canvas that can be moved and resized.

## Rules
- Start with a 1-2 sentence plan of what you're about to create (layout, shape count, connections), then call tools.
- Never say "I can help you with..." — just state the plan and do it.
- Plan the full layout mentally before your first tool call to avoid overlaps.
- Refer to elements by their short ID (first 8 chars) when discussing specific shapes.
- The viewport auto-fits after each tool call, so the user sees your work in real-time as you build.
- Use set_viewport(fit_elements) to focus the user's view on specific elements when you're done.
- After each turn you'll see a screenshot of the canvas. Check if the result looks correct — fix overlaps or missing connections.`
}
