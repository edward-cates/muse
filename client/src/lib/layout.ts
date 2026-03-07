import dagre from 'dagre'
import type { CanvasElement } from '../types'

const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond']

function isNode(el: CanvasElement): boolean {
  return SHAPE_TYPES.includes(el.type) || el.type === 'webcard' || el.type === 'document_card' || el.type === 'decomposition_card' || el.type === 'text' || el.type === 'image'
}

/**
 * Compute hierarchical layout positions for canvas elements using dagre (Sugiyama).
 * Left-to-right: themes on left rank, sources on right rank.
 * Returns a map of element ID → {x, y} for all node elements.
 */
export function computeLayout(elements: CanvasElement[]): Map<string, { x: number; y: number }> {
  const nodes = elements.filter(isNode)
  const edges = elements.filter(el => el.type === 'line')

  if (nodes.length < 2) return new Map()

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 250,
    marginx: 80,
    marginy: 80,
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes with their dimensions
  for (const node of nodes) {
    const w = 'width' in node ? (node.width as number) || 260 : 260
    const h = 'height' in node ? (node.height as number) || 120 : 120
    g.setNode(node.id, { width: w, height: h })
  }

  // Add edges
  for (const edge of edges) {
    if (edge.type !== 'line') continue
    const startId = edge.startShapeId
    const endId = edge.endShapeId
    if (startId && endId && g.hasNode(startId) && g.hasNode(endId)) {
      g.setEdge(startId, endId)
    }
  }

  // Run dagre layout
  dagre.layout(g)

  // Convert center coordinates to top-left
  const positions = new Map<string, { x: number; y: number }>()
  for (const id of g.nodes()) {
    const node = g.node(id)
    if (!node) continue
    positions.set(id, {
      x: Math.round(node.x - node.width / 2),
      y: Math.round(node.y - node.height / 2),
    })
  }

  return positions
}
