import { createRequire } from 'node:module'
import { readElementsFromDoc, updateElementInDoc, type YMapVal } from './yjs-utils.js'
import { updateLiveElement } from './live-docs.js'

const _require = createRequire(import.meta.url)
// graphology CJS exports: Graph constructor directly, fa2/noverlap as callable with .assign/.inferSettings
const GraphConstructor = _require('graphology') as new () => import('graphology').default
const forceAtlas2 = _require('graphology-layout-forceatlas2') as {
  assign(graph: unknown, params: { iterations: number; settings?: Record<string, unknown> }): void
  inferSettings(graph: unknown): Record<string, unknown>
}
const noverlap = _require('graphology-layout-noverlap') as {
  assign(graph: unknown, params: { maxIterations?: number; settings?: Record<string, unknown> }): void
}

type ElementRecord = Record<string, YMapVal>

const SHAPE_TYPES = ['rectangle', 'ellipse', 'diamond']

function isNode(el: ElementRecord): boolean {
  const type = el.type as string
  return SHAPE_TYPES.includes(type) || type === 'webcard' || type === 'document_card' || type === 'decomposition_card'
}

function isEdge(el: ElementRecord): boolean {
  return (el.type as string) === 'line'
}

function nodeSize(el: ElementRecord): number {
  const w = (el.width as number) || 200
  const h = (el.height as number) || 100
  return Math.max(w, h) / 2
}

/**
 * Run force-directed layout on a canvas document's elements.
 * Positions nodes using ForceAtlas2 (topology-aware) then Noverlap (overlap removal).
 * Writes updated x/y positions back to both DB and live Yjs docs.
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

  // Build graph
  const graph = new GraphConstructor()

  // Separate themes (shapes) from sources (webcards/doc cards) for initial seeding
  const themes: ElementRecord[] = []
  const sources: ElementRecord[] = []
  for (const node of nodes) {
    const type = node.type as string
    if (SHAPE_TYPES.includes(type)) {
      themes.push(node)
    } else {
      sources.push(node)
    }
  }

  // Seed initial positions: themes on the left, sources on the right
  const THEME_X = 200
  const SOURCE_X = 700
  const Y_START = 100
  const Y_GAP = 200

  for (let i = 0; i < themes.length; i++) {
    const id = themes[i].id as string
    graph.addNode(id, {
      x: THEME_X + Math.random() * 20,
      y: Y_START + i * Y_GAP + Math.random() * 20,
      size: nodeSize(themes[i]),
    })
  }

  for (let i = 0; i < sources.length; i++) {
    const id = sources[i].id as string
    graph.addNode(id, {
      x: SOURCE_X + Math.random() * 20,
      y: Y_START + i * Y_GAP + Math.random() * 20,
      size: nodeSize(sources[i]),
    })
  }

  // Add edges
  for (const edge of edges) {
    const startId = edge.startShapeId as string
    const endId = edge.endShapeId as string
    if (startId && endId && graph.hasNode(startId) && graph.hasNode(endId)) {
      try {
        graph.addEdge(startId, endId)
      } catch {
        // Duplicate edge — ignore
      }
    }
  }

  // Run ForceAtlas2: topology-aware positioning
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

  // Run Noverlap to remove any remaining overlaps
  noverlap.assign(graph, {
    maxIterations: 200,
    settings: {
      margin: 40,
      ratio: 1.0,
      speed: 3,
    },
  })

  // Read final positions and normalize so the top-left is at (80, 80)
  let minX = Infinity, minY = Infinity
  const positions = new Map<string, { x: number; y: number }>()
  graph.forEachNode((id: string, attrs: Record<string, unknown>) => {
    const ax = attrs.x as number
    const ay = attrs.y as number
    positions.set(id, { x: ax, y: ay })
    if (ax < minX) minX = ax
    if (ay < minY) minY = ay
  })

  const PADDING = 80
  const offsetX = PADDING - minX
  const offsetY = PADDING - minY

  // Write positions back
  for (const [id, pos] of positions) {
    const x = Math.round(pos.x + offsetX)
    const y = Math.round(pos.y + offsetY)
    await updateElementInDoc(documentId, id, { x, y })
    updateLiveElement(documentId, id, { x, y })
  }
}
