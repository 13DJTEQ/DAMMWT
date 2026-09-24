import { useEffect, useState } from 'react';
import { ApprovalCard } from './components/ApprovalCard';
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

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="brand-block">
          <p className="brand-name">MWT DAM</p>
          <h1 className="shell-title">Review workspace</h1>
          <p className="shell-lede">
            Decide pending assets, track resubmits, and keep queue stats in view.
          </p>
        </div>
        <StatsBar stats={snap.stats} />
      </header>

      {snap.loadState === 'error' && snap.error ? (
        <div className="banner banner--error" role="alert">
          <strong>Could not load queue.</strong> {snap.error}
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
            onApprove={(notes) => {
              void controller
                .submitApproval({
                  decision: 'approved',
                  reviewedBy,
                  notes,
                })
                .catch(() => undefined);
            }}
            onReject={(notes) => {
              void controller
                .submitApproval({
                  decision: 'rejected',
                  reviewedBy,
                  notes,
                })
                .catch(() => undefined);
            }}
            onRequestChanges={(notes) => {
              void controller
                .submitApproval({
                  decision: 'changesRequested',
                  reviewedBy,
                  notes,
                })
                .catch(() => undefined);
            }}
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
