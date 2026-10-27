import { useEffect, useRef, useState } from 'react';
import {
  decisionLabel,
  type GalleryAsset,
  type SubmitDecision,
} from '../domain/gallery';
import { displayTitle, partitionLabel } from '../media/manifest';
import { LineageTrail } from './LineageTrail';

interface DecisionPanelProps {
  asset: GalleryAsset | null;
  assets: readonly GalleryAsset[];
  notes: string;
  busy: boolean;
  onNotesChange: (notes: string) => void;
  onDecide: (decision: SubmitDecision, notes?: string) => void;
  onSelectAsset: (assetId: string) => void;
}

const ACTIONS: Array<{ value: SubmitDecision; label: string; hint: string }> = [
  { value: 'love', label: 'Love', hint: '1' },
  { value: 'keep', label: 'Keep', hint: '2' },
  { value: 'reject', label: 'Reject', hint: '3' },
];

export function DecisionPanel({
  asset,
  assets,
  notes,
  busy,
  onNotesChange,
  onDecide,
  onSelectAsset,
}: DecisionPanelProps): JSX.Element {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => {
    setCopyHint(null);
  }, [asset?.assetId]);

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

  const localPath = asset.localPath?.trim() || null;
  const cloudUrl = asset.cloudUrl?.trim() || null;
  const mediaDownload =
    asset.previewUrl?.startsWith('/media/') ||
    asset.previewUrl?.startsWith('http')
      ? asset.previewUrl
      : null;

  const copyLocalPath = async (): Promise<void> => {
    if (!localPath) return;
    try {
      await navigator.clipboard.writeText(localPath);
      setCopyHint('Path copied — browser cannot open Finder; paste in Terminal or Electron.');
    } catch {
      setCopyHint(`Copy failed. Path: ${localPath}`);
    }
  };

  return (
    <section className="panel decision-panel" aria-label="Asset review">
      <header className="panel__header">
        <div>
          <h2>{displayTitle(asset)}</h2>
          <p className="muted asset-meta">
            {asset.partition ? partitionLabel(asset.partition) : 'Gallery'}
            {asset.batch ? ` · ${asset.batch}` : ''}
            {' · '}
            {asset.assetId}
          </p>
        </div>
        <span className={`status status--${asset.status}`}>
          {decisionLabel(asset.status)}
        </span>
      </header>
      <img
        className="preview"
        src={asset.previewUrl}
        alt={asset.description ?? displayTitle(asset)}
      />
      <div className="file-actions" role="group" aria-label="Open asset file">
        {localPath ? (
          <button
            type="button"
            className="file-action"
            title={localPath}
            onClick={() => void copyLocalPath()}
          >
            Copy local path
          </button>
        ) : (
          <span className="muted file-action-note">No localPath</span>
        )}
        {mediaDownload ? (
          <a
            className="file-action file-action--link"
            href={mediaDownload}
            download
            target="_blank"
            rel="noreferrer"
          >
            Download /media
          </a>
        ) : null}
        {cloudUrl ? (
          <a
            className="file-action file-action--link"
            href={cloudUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open cloud
          </a>
        ) : (
          <span className="muted file-action-note" title="No Notion/Drive/CDN URL on this row">
            No cloud URL
          </span>
        )}
      </div>
      {copyHint ? <p className="muted file-action-hint">{copyHint}</p> : null}
      {asset.description ? <p className="description">{asset.description}</p> : null}
      <LineageTrail asset={asset} assets={assets} onSelect={onSelectAsset} />
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
