import type { PartitionFilter, QueueFilter } from '../ReviewController';
import type { MediaPartition, ReviewQueueRow, ReviewStatus } from '../damApi';

interface ReviewQueueProps {
  queue: ReviewQueueRow[];
  filter: QueueFilter;
  partitionFilter: PartitionFilter;
  selectedAssetId: string | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  onFilterChange: (filter: QueueFilter) => void;
  onPartitionChange: (partition: PartitionFilter) => void;
  onSelect: (assetId: string) => void;
}

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'love', label: 'Love' },
  { value: 'keep', label: 'Keep' },
  { value: 'reject', label: 'Reject' },
  { value: 'changesRequested', label: 'Changes' },
  { value: 'all', label: 'All' },
];

const PARTITIONS: Array<{ value: PartitionFilter; label: string }> = [
  { value: 'all', label: 'All media' },
  { value: 'originals', label: 'Originals (Source of Truth)' },
  { value: 'tattoos', label: 'Tattoos' },
  { value: 'generated', label: 'Generated' },
];

function statusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'changesRequested':
      return 'Changes requested';
    case 'love':
      return 'Love';
    case 'keep':
      return 'Keep';
    case 'reject':
      return 'Reject';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function partitionLabel(partition: MediaPartition | null): string | null {
  if (!partition) return null;
  switch (partition) {
    case 'originals':
      return 'Original';
    case 'tattoos':
      return 'Tattoo';
    case 'generated':
      return 'Generated';
    default:
      return partition;
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
  partitionFilter,
  selectedAssetId,
  loadState,
  onFilterChange,
  onPartitionChange,
  onSelect,
}: ReviewQueueProps): JSX.Element {
  return (
    <section className="review-queue" aria-label="Gallery queue">
      <header className="panel-header">
        <h2>Gallery</h2>
        <div
          className="filter-row"
          role="tablist"
          aria-label="Filter by media partition"
        >
          {PARTITIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={partitionFilter === value}
              className={
                partitionFilter === value
                  ? 'filter-btn filter-btn--partition filter-btn--active'
                  : 'filter-btn filter-btn--partition'
              }
              onClick={() => onPartitionChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filter-row" role="tablist" aria-label="Filter by decision">
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
        <p className="panel-state">Loading gallery…</p>
      ) : null}

      {loadState === 'ready' && queue.length === 0 ? (
        <p className="panel-state panel-state--empty">
          No assets match this filter. Run <code>npm run seed:media</code> or
          switch partition / status.
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="gallery-queue-list">
          {queue.map((row) => {
            const selected = row.assetId === selectedAssetId;
            const part = partitionLabel(row.partition);
            const label = row.title?.trim() || row.assetId;
            return (
              <li key={row.assetId}>
                <button
                  type="button"
                  className={
                    selected
                      ? 'gallery-queue-item gallery-queue-item--selected'
                      : 'gallery-queue-item'
                  }
                  onClick={() => onSelect(row.assetId)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <span className="gallery-queue-item__thumb">
                    {row.previewUrl ? (
                      <img src={row.previewUrl} alt="" />
                    ) : (
                      <span className="gallery-queue-item__placeholder">—</span>
                    )}
                  </span>
                  <span className="gallery-queue-item__body">
                    <span className="queue-item__title">{label}</span>
                    <span className="queue-item__meta">
                      {part ? (
                        <span
                          className={`status-chip status-chip--partition-${row.partition}`}
                        >
                          {part}
                        </span>
                      ) : null}
                      <span className={`status-chip status-chip--${row.status}`}>
                        {statusLabel(row.status)}
                      </span>
                      <span>v{row.version}</span>
                      <span>{formatUpdated(row.updatedAt)}</span>
                    </span>
                    {row.projectTag ? (
                      <span className="queue-item__tag">{row.projectTag}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
