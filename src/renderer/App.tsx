import { useEffect, useRef, useState } from 'react';
import { ApprovalCard, type GalleryDecision } from './components/ApprovalCard';
import { ReviewQueue } from './components/ReviewQueue';
import { StatsBar } from './components/StatsBar';
import { VersionHistory } from './components/VersionHistory';
import {
  ReviewController,
  type ReviewControllerSnapshot,
} from './ReviewController';
import { getDamApi, type DamApi } from './damApi';

const DEFAULT_REVIEWER = 'reviewer@mwt.com';
/** Debounce focus / visibility reloads so rapid OS events don't thrash IPC. */
const FOCUS_REFRESH_DEBOUNCE_MS = 400;

export interface AppProps {
  /** Optional injected API (verify). Defaults to getDamApi() / window.damApi. */
  api?: DamApi;
  /** Optional shared controller so verify exercises the same instance App uses. */
  controller?: ReviewController;
  reviewedBy?: string;
}

export function App({
  api,
  controller: externalController,
  reviewedBy = DEFAULT_REVIEWER,
}: AppProps): JSX.Element {
  const [controller] = useState(
    () => externalController ?? new ReviewController(api)
  );
  const [snap, setSnap] = useState<ReviewControllerSnapshot>(() =>
    controller.getSnapshot()
  );
  const [refreshing, setRefreshing] = useState(false);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = controller.subscribe(setSnap);
    void controller.refresh().catch(() => {
      /* error mirrored on snapshot */
    });
    return unsub;
  }, [controller]);

  // Soft refresh when the window is focused / becomes visible (queue reload only).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const schedule = (): void => {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
      focusTimer.current = setTimeout(() => {
        focusTimer.current = null;
        void controller.refresh().catch(() => undefined);
      }, FOCUS_REFRESH_DEBOUNCE_MS);
    };

    const onFocus = (): void => {
      schedule();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        schedule();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
        focusTimer.current = null;
      }
    };
  }, [controller]);

  // Main-process watch / Refresh → media:updated → reload queue.
  useEffect(() => {
    let apiRef: DamApi;
    try {
      apiRef = api ?? getDamApi();
    } catch {
      return undefined;
    }
    if (!apiRef.onMediaUpdated) {
      return undefined;
    }
    return apiRef.onMediaUpdated(() => {
      void controller.refresh().catch(() => undefined);
    });
  }, [api, controller]);

  const runRefresh = (): void => {
    void (async () => {
      setRefreshing(true);
      try {
        let apiRef: DamApi | null = api ?? null;
        if (!apiRef) {
          try {
            apiRef = getDamApi();
          } catch {
            apiRef = null;
          }
        }
        if (apiRef?.refreshMedia) {
          await apiRef.refreshMedia();
        }
        await controller.refresh();
      } catch {
        /* snapshot / banner carry errors */
      } finally {
        setRefreshing(false);
      }
    })();
  };

  const decide = (decision: GalleryDecision, notes?: string): void => {
    void controller
      .submitApproval({
        decision,
        reviewedBy,
        notes: notes?.trim() ? notes : undefined,
      })
      .catch(() => undefined);
  };

  return (
    <div className="app-shell">
      <div className="app-shell__spiral" aria-hidden="true">
        <img
          className="app-shell__spiral-img app-shell__spiral-img--primary"
          src="./assets/brand/fib-spiral.svg"
          alt=""
          draggable={false}
        />
        <img
          className="app-shell__spiral-img app-shell__spiral-img--iris"
          src="./assets/brand/fibonacci-iris.png"
          alt=""
          draggable={false}
        />
      </div>
      <header className="shell-header">
        <div className="brand-block">
          <div className="brand-lockup">
            <img
              className="brand-emblem"
              src="./assets/brand/mwt-emblem.png"
              alt="MWT emblem"
              width={52}
              height={52}
              draggable={false}
            />
            <img
              className="brand-wordmark"
              src="./assets/brand/mwt-logo-primary.jpeg"
              alt="Media Wave Technology"
              draggable={false}
            />
          </div>
          <div className="shell-title-row">
            <div>
              <p className="brand-name">MWT DAM</p>
              <h1 className="shell-title">Gallery</h1>
            </div>
            <button
              type="button"
              className="btn btn--ghost shell-refresh"
              onClick={runRefresh}
              disabled={refreshing || snap.busy}
              title="Re-ingest manifest and reload the queue"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <p className="shell-lede">
            Love, keep, or reject assets with steering notes — Gallery V1 on Electron
            + SQLite.
          </p>
        </div>
        <StatsBar stats={snap.stats} />
      </header>

      {snap.loadState === 'error' && snap.error ? (
        <div className="banner banner--error" role="alert">
          <strong>Could not load gallery.</strong> {snap.error}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              void controller.refresh().catch(() => undefined);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      <main className="workspace">
        <ReviewQueue
          queue={snap.queue}
          filter={snap.filter}
          partitionFilter={snap.partitionFilter}
          projectFilter={snap.projectFilter}
          availableProjects={snap.availableProjects}
          selectedAssetId={snap.selectedAssetId}
          loadState={snap.loadState}
          onFilterChange={(filter) => {
            void controller.setFilter(filter);
          }}
          onPartitionChange={(partition) => {
            void controller.setPartitionFilter(partition);
          }}
          onProjectChange={(project) => {
            void controller.setProjectFilter(project);
          }}
          onSelect={(assetId) => controller.selectAsset(assetId)}
        />

        <div className="workspace-detail">
          <ApprovalCard
            asset={snap.selected}
            parentAsset={snap.parentAsset}
            busy={snap.busy}
            reviewedBy={reviewedBy}
            notes={snap.notesDraft}
            onNotesChange={(notes) => controller.setNotesDraft(notes)}
            onDecide={decide}
            onRevealParent={(assetId) => {
              void controller.revealAsset(assetId).catch(() => undefined);
            }}
          />
          <VersionHistory
            asset={snap.selected}
            parentAsset={snap.parentAsset}
            history={snap.history}
            busy={snap.busy}
            onResubmit={(source, preview) => {
              void controller
                .resubmitSelected(source, preview)
                .catch(() => undefined);
            }}
            onRevealParent={(assetId) => {
              void controller.revealAsset(assetId).catch(() => undefined);
            }}
          />
        </div>
      </main>
    </div>
  );
}
