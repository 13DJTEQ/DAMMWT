import { useEffect, useState } from 'react';
import { ApprovalCard, type GalleryDecision } from './components/ApprovalCard';
import { ReviewQueue } from './components/ReviewQueue';
import { StatsBar } from './components/StatsBar';
import { VersionHistory } from './components/VersionHistory';
import {
  ReviewController,
  type ReviewControllerSnapshot,
} from './ReviewController';
import type { DamApi } from './damApi';

const DEFAULT_REVIEWER = 'reviewer@mwt.com';

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

  useEffect(() => {
    const unsub = controller.subscribe(setSnap);
    void controller.refresh().catch(() => {
      /* error mirrored on snapshot */
    });
    return unsub;
  }, [controller]);

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
          <p className="brand-name">MWT DAM</p>
          <h1 className="shell-title">Gallery</h1>
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
          selectedAssetId={snap.selectedAssetId}
          loadState={snap.loadState}
          onFilterChange={(filter) => {
            void controller.setFilter(filter);
          }}
          onSelect={(assetId) => controller.selectAsset(assetId)}
        />

        <div className="workspace-detail">
          <ApprovalCard
            asset={snap.selected}
            busy={snap.busy}
            reviewedBy={reviewedBy}
            notes={snap.notesDraft}
            onNotesChange={(notes) => controller.setNotesDraft(notes)}
            onDecide={decide}
          />
          <VersionHistory
            asset={snap.selected}
            history={snap.history}
            busy={snap.busy}
            onResubmit={(source, preview) => {
              void controller
                .resubmitSelected(source, preview)
                .catch(() => undefined);
            }}
          />
        </div>
      </main>
    </div>
  );
}
