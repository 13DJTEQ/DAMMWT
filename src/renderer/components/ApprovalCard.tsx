import { useEffect, useRef } from 'react';
import type { ReviewQueueRow } from '../damApi';

export type GalleryDecision = 'love' | 'keep' | 'reject' | 'changesRequested';

interface ApprovalCardProps {
  asset: ReviewQueueRow | null;
  busy: boolean;
  reviewedBy: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  onDecide: (decision: GalleryDecision, notes?: string) => void;
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
  notes,
  onNotesChange,
  onDecide,
}: ApprovalCardProps): JSX.Element {
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!asset) return;

    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable);
      if (typing && event.key !== 'Escape') {
        if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
        }
        return;
      }

      if (busy) return;
      if (asset.status !== 'pending' && asset.status !== 'changesRequested') return;

      if (event.key === '1') {
        event.preventDefault();
        onDecide('love', notes);
      } else if (event.key === '2') {
        event.preventDefault();
        onDecide('keep', notes);
      } else if (event.key === '3') {
        event.preventDefault();
        onDecide('reject', notes);
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        notesRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asset, busy, notes, onDecide]);

  if (!asset) {
    return (
      <section className="approval-panel" aria-label="Asset review">
        <p className="panel-state panel-state--empty">
          Select an asset from the gallery to preview, react, and add notes.
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

      <label className="gallery-notes">
        <span className="gallery-notes__label">Notes</span>
        <textarea
          ref={notesRef}
          className="gallery-notes__input"
          rows={3}
          value={notes}
          disabled={!canDecide}
          placeholder="Steering notes for this decision…"
          aria-label="Gallery notes"
          onChange={(event) => onNotesChange(event.target.value)}
        />
      </label>

      <div className="decision-row" role="group" aria-label="Gallery decisions">
        <button
          type="button"
          className="btn btn--love"
          disabled={!canDecide}
          aria-label="Love"
          title="Love (1)"
          onClick={() => onDecide('love', notes)}
        >
          ❤️ Love
        </button>
        <button
          type="button"
          className="btn btn--keep"
          disabled={!canDecide}
          aria-label="Keep"
          title="Keep (2)"
          onClick={() => onDecide('keep', notes)}
        >
          👍 Keep
        </button>
        <button
          type="button"
          className="btn btn--reject"
          disabled={!canDecide}
          aria-label="Reject"
          title="Reject (3)"
          onClick={() => onDecide('reject', notes)}
        >
          👎 Reject
        </button>
        <button
          type="button"
          className="btn btn--changes"
          disabled={!canDecide}
          title="Request changes (secondary)"
          onClick={() =>
            onDecide('changesRequested', notes.trim() || 'Needs revision before publish')
          }
        >
          Request Changes
        </button>
      </div>

      <p className="panel-hint">
        Keys: 1 love · 2 keep · 3 reject · n notes
      </p>

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
