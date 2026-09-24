import type { QueueFilter } from '../ReviewController';
import type { ReviewQueueRow, ReviewStatus } from '../damApi';

interface ReviewQueueProps {
  queue: ReviewQueueRow[];
  filter: QueueFilter;
  selectedAssetId: string | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  onFilterChange: (filter: QueueFilter) => void;
  onSelect: (assetId: string) => void;
}

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'changesRequested', label: 'Changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

function statusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'changesRequested':
      return 'Changes requested';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ReviewQueue({
  queue,
  filter,
  selectedAssetId,
  loadState,
  onFilterChange,
  onSelect,
}: ReviewQueueProps): JSX.Element {
  return (
    <section className="review-queue" aria-label="Review queue">
      <header className="panel-header">
        <h2>Queue</h2>
        <div className="filter-row" role="tablist" aria-label="Filter by status">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={
                filter === value ? 'filter-btn filter-btn--active' : 'filter-btn'
              }
              onClick={() => onFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {loadState === 'loading' && queue.length === 0 ? (
        <p className="panel-state">Loading review queue…</p>
      ) : null}

      {loadState === 'ready' && queue.length === 0 ? (
        <p className="panel-state panel-state--empty">
          No assets match this filter. Ingest media or switch status to see work.
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="queue-list">
          {queue.map((row) => {
            const selected = row.assetId === selectedAssetId;
            return (
              <li key={row.assetId}>
                <button
                  type="button"
                  className={
                    selected ? 'queue-item queue-item--selected' : 'queue-item'
                  }
                  onClick={() => onSelect(row.assetId)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <span className="queue-item__title">{row.assetId}</span>
                  <span className="queue-item__meta">
                    <span className={`status-chip status-chip--${row.status}`}>
                      {statusLabel(row.status)}
                    </span>
                    <span>v{row.version}</span>
                    <span>{formatUpdated(row.updatedAt)}</span>
                  </span>
                  {row.projectTag ? (
                    <span className="queue-item__tag">{row.projectTag}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
