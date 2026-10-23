import { decisionLabel, type GalleryAsset, type GalleryDecision } from '../domain/gallery';

interface GalleryListProps {
  assets: GalleryAsset[];
  selectedId: string | null;
  filter: GalleryDecision | 'all';
  onSelect: (assetId: string) => void;
  onFilter: (filter: GalleryDecision | 'all') => void;
}

const FILTERS: Array<GalleryDecision | 'all'> = [
  'all',
  'pending',
  'love',
  'keep',
  'reject',
  'changesRequested',
];

export function GalleryList({
  assets,
  selectedId,
  filter,
  onSelect,
  onFilter,
}: GalleryListProps): JSX.Element {
  const visible =
    filter === 'all' ? assets : assets.filter((a) => a.status === filter);

  return (
    <section className="panel gallery-list" aria-label="Gallery queue">
      <header className="panel__header">
        <h2>Gallery</h2>
        <div className="filter-row" role="tablist" aria-label="Filter by decision">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'chip chip--active' : 'chip'}
              onClick={() => onFilter(key)}
            >
              {key === 'all' ? 'All' : decisionLabel(key)}
            </button>
          ))}
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="panel-state">No assets match this filter.</p>
      ) : (
        <ul className="queue">
          {visible.map((asset) => (
            <li key={asset.assetId}>
              <button
                type="button"
                className={
                  selectedId === asset.assetId
                    ? 'queue-item queue-item--selected'
                    : 'queue-item'
                }
                onClick={() => onSelect(asset.assetId)}
              >
                <img src={asset.previewUrl} alt="" className="queue-item__thumb" />
                <span className="queue-item__body">
                  <strong>{asset.assetId}</strong>
                  <span className={`status status--${asset.status}`}>
                    {decisionLabel(asset.status)}
                  </span>
                  <span className="muted">rev {asset.revision}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
