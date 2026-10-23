import { useEffect, useRef } from 'react';
import {
  decisionLabel,
  type GalleryAsset,
  type SubmitDecision,
} from '../domain/gallery';

interface DecisionPanelProps {
  asset: GalleryAsset | null;
  notes: string;
  busy: boolean;
  onNotesChange: (notes: string) => void;
  onDecide: (decision: SubmitDecision, notes?: string) => void;
}

const ACTIONS: Array<{ value: SubmitDecision; label: string; hint: string }> = [
  { value: 'love', label: 'Love', hint: '1' },
  { value: 'keep', label: 'Keep', hint: '2' },
  { value: 'reject', label: 'Reject', hint: '3' },
];

export function DecisionPanel({
  asset,
  notes,
  busy,
  onNotesChange,
  onDecide,
}: DecisionPanelProps): JSX.Element {
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
      if (typing && event.key !== 'Escape') return;
      if (busy) return;

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
      <section className="panel decision-panel" aria-label="Asset review">
        <p className="panel-state">Select an asset to preview and decide.</p>
      </section>
    );
  }

  return (
    <section className="panel decision-panel" aria-label="Asset review">
      <header className="panel__header">
        <h2>{asset.assetId}</h2>
        <span className={`status status--${asset.status}`}>
          {decisionLabel(asset.status)}
        </span>
      </header>
      <img
        className="preview"
        src={asset.previewUrl}
        alt={asset.description ?? asset.assetId}
      />
      {asset.description ? <p className="description">{asset.description}</p> : null}
      <label className="notes">
        <span>Notes</span>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          placeholder="Steering notes for this decision…"
          disabled={busy}
        />
      </label>
      <div className="decision-row" role="group" aria-label="Gallery decisions">
        {ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            className={`decide decide--${action.value}`}
            disabled={busy}
            onClick={() => onDecide(action.value, notes)}
          >
            {action.label}
            <kbd>{action.hint}</kbd>
          </button>
        ))}
      </div>
      <p className="muted shortcuts">Keys: 1 love · 2 keep · 3 reject · n notes</p>
    </section>
  );
}
