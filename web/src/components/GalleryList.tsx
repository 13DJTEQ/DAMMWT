import {
  decisionLabel,
  type GalleryAsset,
  type GalleryDecision,
  type MediaPartition,
} from '../domain/gallery';
import { displayTitle, partitionLabel } from '../media/manifest';
import { resolveProjectSlug } from '../media/projectSlug';

export type SectionFilter = MediaPartition | 'all';
export type ProjectFilter = 'all' | string;

interface GalleryListProps {
  assets: GalleryAsset[];
  selectedId: string | null;
  section: SectionFilter;
  filter: GalleryDecision | 'all';
  projectFilter: ProjectFilter;
  availableSections: MediaPartition[];
  availableProjects: string[];
  onSelect: (assetId: string) => void;
  onSection: (section: SectionFilter) => void;
  onFilter: (filter: GalleryDecision | 'all') => void;
  onProject: (project: ProjectFilter) => void;
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
  section,
  filter,
  projectFilter,
  availableSections,
  availableProjects,
  onSelect,
  onSection,
  onFilter,
  onProject,
}: GalleryListProps): JSX.Element {
  const sectioned =
    section === 'all'
      ? assets
      : assets.filter((a) => (a.partition ?? 'tattoos') === section);
  const projected =
    projectFilter === 'all'
      ? sectioned
      : sectioned.filter((a) => resolveProjectSlug(a) === projectFilter);
  const visible =
    filter === 'all'
      ? projected
      : projected.filter((a) => a.status === filter);

  const sectionTitle =
    section === 'all' ? 'Gallery' : partitionLabel(section);
  const useProjectSelect = availableProjects.length > 8;

  return (
    <section className="panel gallery-list" aria-label="Gallery queue">
      <header className="panel__header">
        <h2>{sectionTitle}</h2>
        <div className="filter-row" role="tablist" aria-label="Media section">
          {availableSections.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              className={section === key ? 'chip chip--active' : 'chip'}
              onClick={() => onSection(key)}
            >
              {key === 'originals' ? 'Originals / SoT' : partitionLabel(key)}
            </button>
          ))}
        </div>
        {availableProjects.length > 0 ? (
          useProjectSelect ? (
            <div className="filter-row filter-row--project">
              <label className="filter-select-label" htmlFor="web-project-filter">
                Project
              </label>
              <select
                id="web-project-filter"
                className="filter-select"
                aria-label="Filter by project"
                value={projectFilter}
                onChange={(e) => onProject(e.target.value as ProjectFilter)}
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
              aria-label="Filter by project"
            >
              <button
                type="button"
                role="tab"
                aria-selected={projectFilter === 'all'}
                className={
                  projectFilter === 'all' ? 'chip chip--active' : 'chip'
                }
                onClick={() => onProject('all')}
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
                    projectFilter === slug ? 'chip chip--active' : 'chip'
                  }
                  onClick={() => onProject(slug)}
                >
                  {slug}
                </button>
              ))}
            </div>
          )
        ) : null}
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
                  <strong>{displayTitle(asset)}</strong>
                  <span className={`status status--${asset.status}`}>
                    {decisionLabel(asset.status)}
                  </span>
                  <span className="muted">
                    {asset.partition ?? 'tattoos'}
                    {asset.parentSourceId ? ' · linked' : ''}
                    {' · '}rev {asset.revision}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
