import type { ReviewQueueRow } from '../damApi';

interface ApprovalCardProps {
  asset: ReviewQueueRow | null;
  busy: boolean;
  reviewedBy: string;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
  onRequestChanges: (notes?: string) => void;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function ApprovalCard({
  asset,
  busy,
  reviewedBy,
  onApprove,
  onReject,
  onRequestChanges,
}: ApprovalCardProps): JSX.Element {
  if (!asset) {
    return (
      <section className="approval-panel" aria-label="Asset review">
        <p className="panel-state panel-state--empty">
          Select an asset from the queue to preview metadata and decide.
        </p>
      </section>
    );
  }

  const tags = parseTags(asset.tags);
  const canDecide =
    !busy && (asset.status === 'pending' || asset.status === 'changesRequested');

  return (
    <section className="approval-panel" aria-label={`Review ${asset.assetId}`}>
      <header className="panel-header">
        <h2>{asset.assetId}</h2>
        <p className="approval-sub">
          Version {asset.version} · {asset.sourceBackend} · reviewer {reviewedBy}
        </p>
      </header>

      <div className="preview-stage">
        {asset.previewUrl ? (
          <img
            src={asset.previewUrl}
            alt={`Preview for ${asset.assetId}`}
            className="preview-image"
          />
        ) : (
          <div className="preview-placeholder">No preview URL on this version</div>
        )}
      </div>

      <dl className="meta-grid">
        <div>
          <dt>Source</dt>
          <dd>{asset.sourceIdentifier}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{asset.status}</dd>
        </div>
        {asset.projectTag ? (
          <div>
            <dt>Project</dt>
            <dd>{asset.projectTag}</dd>
          </div>
        ) : null}
        {asset.designatedReviewer ? (
          <div>
            <dt>Designated</dt>
            <dd>{asset.designatedReviewer}</dd>
          </div>
        ) : null}
        {asset.description ? (
          <div className="meta-grid__full">
            <dt>Description</dt>
            <dd>{asset.description}</dd>
          </div>
        ) : null}
        {tags.length > 0 ? (
          <div className="meta-grid__full">
            <dt>Tags</dt>
            <dd>{tags.join(', ')}</dd>
          </div>
        ) : null}
      </dl>

      <div className="decision-row">
        <button
          type="button"
          className="btn btn--approve"
          disabled={!canDecide}
          onClick={() => onApprove()}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn--reject"
          disabled={!canDecide}
          onClick={() => onReject()}
        >
          Reject
        </button>
        <button
          type="button"
          className="btn btn--changes"
          disabled={!canDecide}
          onClick={() => onRequestChanges('Needs revision before publish')}
        >
          Request Changes
        </button>
      </div>

      {!canDecide && !busy ? (
        <p className="panel-hint">
          This asset is already {asset.status}. Pick a pending item or wait for a
          resubmit.
        </p>
      ) : null}
      {busy ? <p className="panel-hint">Saving decision…</p> : null}
    </section>
  );
}
