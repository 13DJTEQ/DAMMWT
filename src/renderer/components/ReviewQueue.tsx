import type {
  PartitionFilter,
  ProjectFilter,
  QueueFilter,
} from '../ReviewController';
import type { MediaPartition, ReviewQueueRow, ReviewStatus } from '../damApi';
import { getDamApi } from '../damApi';

interface ReviewQueueProps {
  queue: ReviewQueueRow[];
  filter: QueueFilter;
  partitionFilter: PartitionFilter;
  projectFilter: ProjectFilter;
  availableProjects: string[];
  selectedAssetId: string | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  onFilterChange: (filter: QueueFilter) => void;
  onPartitionChange: (partition: PartitionFilter) => void;
  onProjectChange: (project: ProjectFilter) => void;
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
  projectFilter,
  availableProjects,
  selectedAssetId,
  loadState,
  onFilterChange,
  onPartitionChange,
  onProjectChange,
  onSelect,
}: ReviewQueueProps): JSX.Element {
  const useProjectSelect = availableProjects.length > 8;

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
        <div className="filter-row filter-row--project-nav">
          <span className="filter-section-label" id="projects-nav-label">
            Projects
          </span>
          {availableProjects.length > 0 ? (
            useProjectSelect ? (
              <div className="filter-row filter-row--project">
                <label className="filter-select-label" htmlFor="project-filter">
                  Section
                </label>
                <select
                  id="project-filter"
                  className="filter-select"
                  aria-labelledby="projects-nav-label"
                  aria-label="Filter by project"
                  value={projectFilter}
                  onChange={(e) =>
                    onProjectChange(e.target.value as ProjectFilter)
                  }
                >
                  <option value="all">All projects</option>
                  {availableProjects.map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div
                className="filter-row"
                role="tablist"
                aria-labelledby="projects-nav-label"
                aria-label="Filter by project"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={projectFilter === 'all'}
                  className={
                    projectFilter === 'all'
                      ? 'filter-btn filter-btn--project filter-btn--active'
                      : 'filter-btn filter-btn--project'
                  }
                  onClick={() => onProjectChange('all')}
                >
                  All projects
                </button>
                {availableProjects.map((slug) => (
                  <button
                    key={slug}
                    type="button"
                    role="tab"
                    aria-selected={projectFilter === slug}
                    className={
                      projectFilter === slug
                        ? 'filter-btn filter-btn--project filter-btn--active'
                        : 'filter-btn filter-btn--project'
                    }
                    onClick={() => onProjectChange(slug)}
                  >
                    {slug}
                  </button>
                ))}
              </div>
            )
          ) : (
            <p className="filter-hint">
              No project sections yet —{' '}
              <code>npm run dam:section -- --project &lt;slug&gt;</code>
            </p>
          )}
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
          {projectFilter !== 'all' ? (
            <>
              No assets in project <code>{projectFilter}</code> for this filter.
              Push with{' '}
              <code>
                npm run push:media -- --project {projectFilter} --file …
              </code>{' '}
              or switch status to All, then click Refresh.
            </>
          ) : (
            <>
              No assets match this filter. Run <code>npm run seed:media</code>{' '}
              (or <code>SEED=1 npm run review:electron</code>) or switch
              partition / status.
            </>
          )}
        </p>
      ) : null}

      {queue.length > 0 ? (
        <ul className="gallery-queue-list">
          {queue.map((row) => {
            const selected = row.assetId === selectedAssetId;
            const part = partitionLabel(row.partition);
            const label = row.title?.trim() || row.assetId;
            return (
              <li
                key={row.assetId}
                className={
                  selected
                    ? 'gallery-queue-item gallery-queue-item--selected'
                    : 'gallery-queue-item'
                }
              >
                <button
                  type="button"
                  className="gallery-queue-item__select"
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
                {row.localPath || row.cloudUrl ? (
                  <span className="queue-item__file-links">
                    {row.localPath ? (
                      <button
                        type="button"
                        className="queue-file-link"
                        title="Reveal in Finder / Show file"
                        onClick={() => {
                          void getDamApi().revealInFolder?.(row.localPath!);
                        }}
                      >
                        Show file
                      </button>
                    ) : null}
                    {row.cloudUrl ? (
                      <button
                        type="button"
                        className="queue-file-link"
                        title="Open cloud URL"
                        onClick={() => {
                          void getDamApi().openCloudUrl?.(row.cloudUrl!);
                        }}
                      >
                        Cloud
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
