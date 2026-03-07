import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import noverlap from 'graphology-layout-noverlap'
import type { CanvasElement } from '../types'

const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond']

function isNode(el: CanvasElement): boolean {
  return SHAPE_TYPES.includes(el.type) || el.type === 'webcard' || el.type === 'document_card' || el.type === 'decomposition_card' || el.type === 'text' || el.type === 'image'
}

function nodeSize(el: CanvasElement): number {
  const w = 'width' in el ? (el.width as number) || 200 : 200
  const h = 'height' in el ? (el.height as number) || 100 : 100
  return Math.max(w, h) / 2
}

/**
 * Compute force-directed layout positions for canvas elements.
 * Returns a map of element ID → {x, y} for all node elements.
 */
export function computeLayout(elements: CanvasElement[]): Map<string, { x: number; y: number }> {
  const nodes = elements.filter(isNode)
  const edges = elements.filter(el => el.type === 'line')

  if (nodes.length < 2) return new Map()

  const graph = new Graph()

  // Separate themes (shapes) from other nodes for initial seeding
  const themes: CanvasElement[] = []
  const sources: CanvasElement[] = []
  for (const node of nodes) {
    if (SHAPE_TYPES.includes(node.type)) {
      themes.push(node)
    } else {
      sources.push(node)
    }
  }

  // Seed initial positions: themes left, sources right, with small jitter
  const THEME_X = 200
  const SOURCE_X = 600
  const Y_START = 100
  const Y_GAP = 200

  for (let i = 0; i < themes.length; i++) {
    graph.addNode(themes[i].id, {
      x: THEME_X + Math.random() * 20,
      y: Y_START + i * Y_GAP + Math.random() * 20,
      size: nodeSize(themes[i]),
    })
  }

  for (let i = 0; i < sources.length; i++) {
    graph.addNode(sources[i].id, {
      x: SOURCE_X + Math.random() * 20,
      y: Y_START + i * Y_GAP + Math.random() * 20,
      size: nodeSize(sources[i]),
    })
  }

  // Add edges
  for (const edge of edges) {
    if (edge.type !== 'line') continue
    const startId = edge.startShapeId
    const endId = edge.endShapeId
    if (startId && endId && graph.hasNode(startId) && graph.hasNode(endId)) {
      try {
        graph.addEdge(startId, endId)
      } catch {
        // Duplicate edge
      }
    }
  }

  // ForceAtlas2: topology-aware positioning
  forceAtlas2.assign(graph, {
    iterations: 300,
    settings: {
      gravity: 0.1,
      scalingRatio: 200,
      barnesHutOptimize: false,
      adjustSizes: true,
      strongGravityMode: false,
      slowDown: 2,
    },
  })

  // Noverlap: remove any remaining overlaps
  noverlap.assign(graph, {
    maxIterations: 200,
    settings: {
      margin: 40,
      ratio: 1.0,
      speed: 3,
    },
  })

  // Normalize so top-left is at (80, 80)
  let minX = Infinity
  let minY = Infinity
  const positions = new Map<string, { x: number; y: number }>()

  graph.forEachNode((id: string, attrs: Record<string, unknown>) => {
    const x = attrs.x as number
    const y = attrs.y as number
    positions.set(id, { x, y })
    if (x < minX) minX = x
    if (y < minY) minY = y
  })

  const PADDING = 80
  const offsetX = PADDING - minX
  const offsetY = PADDING - minY

  for (const [id, pos] of positions) {
    positions.set(id, {
      x: Math.round(pos.x + offsetX),
      y: Math.round(pos.y + offsetY),
    })
  }

  return positions
}
