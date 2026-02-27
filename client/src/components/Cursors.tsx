import type { RemoteCursor } from '../hooks/useCursors'

interface Props {
  cursors: RemoteCursor[]
}

export function Cursors({ cursors }: Props) {
  return (
    <>
      {cursors.map((c) => (
        <div
          key={c.clientId}
          className="cursor"
          style={{
            left: c.x,
            top: c.y,
          }}
        >
          <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
            <path
              d="M0 0L16 12H6L3 20L0 0Z"
              fill={c.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          <span className="cursor__label" style={{ backgroundColor: c.color }}>
            {c.name}
          </span>
        </div>
      ))}
    </>
  )
}
