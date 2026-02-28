import { useCallback } from 'react'
import { isShape, isText, isFrame } from '../types'
import type { CanvasElement, ShapeElement } from '../types'

interface Props {
  elements: CanvasElement[]
  offset: { x: number; y: number }
  scale: number
  onPan: (x: number, y: number) => void
}

const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 150

export function Minimap({ elements, offset, scale, onPan }: Props) {
  // Compute bounding box of all elements
  let minX = 0, minY = 0, maxX = 1000, maxY = 800
  for (const el of elements) {
    if ('x' in el && 'width' in el) {
      const s = el as { x: number; y: number; width: number; height: number }
      minX = Math.min(minX, s.x)
      minY = Math.min(minY, s.y)
      maxX = Math.max(maxX, s.x + s.width)
      maxY = Math.max(maxY, s.y + s.height)
    }
  }

  const worldWidth = maxX - minX + 200
  const worldHeight = maxY - minY + 200
  const scaleX = MINIMAP_WIDTH / worldWidth
  const scaleY = MINIMAP_HEIGHT / worldHeight
  const minimapScale = Math.min(scaleX, scaleY)

  // Viewport rectangle
  const vpWidth = window.innerWidth / scale
  const vpHeight = window.innerHeight / scale
  const vpX = (-offset.x / scale - minX + 100) * minimapScale
  const vpY = (-offset.y / scale - minY + 100) * minimapScale
  const vpW = vpWidth * minimapScale
  const vpH = vpHeight * minimapScale

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      // Convert minimap coords to world coords
      const worldX = clickX / minimapScale + minX - 100
      const worldY = clickY / minimapScale + minY - 100

      // Center viewport on this position
      onPan(
        -worldX * scale + window.innerWidth / 2,
        -worldY * scale + window.innerHeight / 2,
      )
    },
    [minimapScale, minX, minY, scale, onPan],
  )

  return (
    <div className="minimap" onClick={handleClick} style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}>
      {elements.filter(el => isShape(el) || isText(el) || isFrame(el)).map((el) => {
        const s = el as { id: string; x: number; y: number; width: number; height: number; fill?: string }
        return (
          <div
            key={s.id}
            className="minimap__shape"
            style={{
              position: 'absolute',
              left: (s.x - minX + 100) * minimapScale,
              top: (s.y - minY + 100) * minimapScale,
              width: Math.max(2, s.width * minimapScale),
              height: Math.max(2, s.height * minimapScale),
              background: s.fill || '#4f46e5',
            }}
          />
        )
      })}
      <div
        className="minimap__viewport"
        style={{
          position: 'absolute',
          left: vpX,
          top: vpY,
          width: vpW,
          height: vpH,
          border: '1.5px solid #4f46e5',
          background: 'rgba(79, 70, 229, 0.08)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
