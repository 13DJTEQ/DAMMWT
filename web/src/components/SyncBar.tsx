import type { GalleryStats } from '../domain/gallery';
import type { SyncStatusSnapshot } from '../sync/types';
import type { GalleryStoreKind } from '../storage/GalleryStore';

interface SyncBarProps {
  storeKind: GalleryStoreKind;
  sync: SyncStatusSnapshot;
  stats: GalleryStats;
  onSync: () => void;
  busy: boolean;
}

export function SyncBar({
  storeKind,
  sync,
  stats,
  onSync,
  busy,
}: SyncBarProps): JSX.Element {
  return (
    <header className="sync-bar" aria-label="Sync status">
      <div className="brand">
        <span className="brand__name">MWT DAM</span>
        <span className="brand__sub">Web Gallery · sync scaffold</span>
      </div>
      <div className="stats" aria-label="Decision stats">
        <span>
          <strong>{stats.total}</strong> total
        </span>
        <span>
          <strong>{stats.love}</strong> love
        </span>
        <span>
          <strong>{stats.keep}</strong> keep
        </span>
        <span>
          <strong>{stats.reject}</strong> reject
        </span>
      </div>
      <div className="sync-meta">
        <span className="pill">store: {storeKind}</span>
        <span className="pill">sync: {sync.backend}</span>
        <span className="pill">phase: {sync.phase}</span>
        <span className="pill">pending push: {sync.pendingPushCount}</span>
        <button type="button" className="sync-btn" onClick={onSync} disabled={busy}>
          {busy ? 'Syncing…' : 'Pull / Push'}
        </button>
      </div>
      {sync.lastError ? (
        <p className="sync-error" role="alert">
          {sync.lastError}
        </p>
      ) : null}
    </header>
  );
}
