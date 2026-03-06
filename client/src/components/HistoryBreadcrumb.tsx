import type { HistoryEntry } from '../hooks/useNavigationHistory'

interface Props {
  items: HistoryEntry[]
  onNavigate: (id: string) => void
}

export function HistoryBreadcrumb({ items, onNavigate }: Props) {
  return (
    <div className="history-breadcrumb" data-testid="history-breadcrumb">
      {items.map((item, i) => (
        <span key={item.id}>
          {i > 0 && <span className="history-breadcrumb__sep">/</span>}
          <button
            className="history-breadcrumb__item"
            data-testid="breadcrumb-item"
            onClick={() => onNavigate(item.id)}
          >
            {item.title}
          </button>
        </span>
      ))}
    </div>
  )
}
