import { createRequire } from 'node:module'
import { readElementsFromDoc, updateElementInDoc, type YMapVal } from './yjs-utils.js'
import { updateLiveElement } from './live-docs.js'

const _require = createRequire(import.meta.url)
const dagre = _require('dagre') as typeof import('dagre')

type ElementRecord = Record<string, YMapVal>

const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond']

function isNode(el: ElementRecord): boolean {
  const type = el.type as string
  return SHAPE_TYPES.includes(type) || type === 'webcard' || type === 'document_card' || type === 'decomposition_card'
}

function isEdge(el: ElementRecord): boolean {
  return (el.type as string) === 'line'
}

/**
 * Hierarchical layout using dagre (Sugiyama-style).
 * Themes on the left rank, sources on the right rank.
 * Minimizes edge crossings for a clean knowledge graph.
 */
export async function layoutCanvas(
  documentId: string,
  parentDocId?: string,
  parentCardId?: string,
): Promise<void> {
  const elements = await readElementsFromDoc(documentId)

  const nodes = elements.filter(isNode)
  const edges = elements.filter(isEdge)

  if (nodes.length < 2) return

  // Create a new directed graph
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'LR',      // left-to-right: themes on left, sources on right
    nodesep: 60,         // vertical spacing between nodes in same rank
    ranksep: 250,        // horizontal spacing between ranks (theme ↔ source columns)
    marginx: 80,
    marginy: 80,
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes with their dimensions
  for (const node of nodes) {
    const id = node.id as string
    const w = (node.width as number) || 260
    const h = (node.height as number) || 120
    g.setNode(id, { width: w, height: h })
  }

  // Add edges
  for (const edge of edges) {
    const startId = edge.startShapeId as string
    const endId = edge.endShapeId as string
    if (startId && endId && g.hasNode(startId) && g.hasNode(endId)) {
      g.setEdge(startId, endId)
    }
  }

  // Run the dagre layout
  dagre.layout(g)

  // Read final positions — dagre gives center coordinates, convert to top-left
  for (const id of g.nodes()) {
    const node = g.node(id)
    if (!node) continue
    const x = Math.round(node.x - node.width / 2)
    const y = Math.round(node.y - node.height / 2)
    await updateElementInDoc(documentId, id, { x, y })
    updateLiveElement(documentId, id, { x, y })
  }
}
