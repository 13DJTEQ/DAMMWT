import type { ApprovalHistoryRow, ReviewQueueRow } from '../damApi';

interface VersionHistoryProps {
  asset: ReviewQueueRow | null;
  history: ApprovalHistoryRow[];
  busy: boolean;
  onResubmit: (newSourceIdentifier: string, previewUrl: string) => void;
}

function decisionLabel(decision: string): string {
  if (decision === 'changesRequested') return 'Changes requested';
  if (decision === 'pending') return 'Submitted';
  return decision.charAt(0).toUpperCase() + decision.slice(1);
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function VersionHistory({
  asset,
  history,
  busy,
  onResubmit,
}: VersionHistoryProps): JSX.Element {
  if (!asset) {
    return (
      <section className="version-history" aria-label="Version history">
        <header className="panel-header">
          <h2>Version history</h2>
        </header>
        <p className="panel-state panel-state--empty">
          History appears after you select an asset.
        </p>
      </section>
    );
  }

  const canResubmit = asset.status === 'changesRequested' && !busy;

  return (
    <section className="version-history" aria-label="Version history">
      <header className="panel-header">
        <h2>Version history</h2>
        <p className="approval-sub">Resubmit chain for {asset.assetId}</p>
      </header>

      {history.length === 0 ? (
        <p className="panel-state panel-state--empty">No history rows yet.</p>
      ) : (
        <ol className="history-list">
          {history.map((row) => (
            <li key={row.id} className="history-item">
              <div className="history-item__head">
                <span className="history-version">v{row.version}</span>
                <span className={`status-chip status-chip--${row.decision}`}>
                  {decisionLabel(row.decision)}
                </span>
              </div>
              <div className="history-item__meta">
                {row.reviewedBy ? <span>{row.reviewedBy}</span> : <span>System</span>}
                <span>{formatWhen(row.reviewedAt)}</span>
              </div>
              {row.notes ? <p className="history-notes">{row.notes}</p> : null}
            </li>
          ))}
        </ol>
      )}

      {canResubmit ? (
        <div className="resubmit-row">
          <button
            type="button"
            className="btn btn--resubmit"
            disabled={busy}
            onClick={() => {
              const nextId = `${asset.sourceIdentifier}#v${asset.version + 1}`;
              const nextPreview = asset.previewUrl;
              onResubmit(nextId, nextPreview);
            }}
          >
            Resubmit as v{asset.version + 1}
          </button>
          <p className="panel-hint">
            Bumps version, resets status to pending, and appends a new history row.
          </p>
        </div>
      ) : null}
    </section>
  );
}
