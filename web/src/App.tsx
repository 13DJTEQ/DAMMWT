import { useEffect, useState } from 'react';
import { DecisionPanel } from './components/DecisionPanel';
import { GalleryList } from './components/GalleryList';
import { SpiralAccent } from './components/SpiralAccent';
import { SyncBar } from './components/SyncBar';
import {
  computeStats,
  type GalleryAsset,
  type GalleryDecision,
  type SubmitDecision,
} from './domain/gallery';
import { createGalleryStore } from './storage/createStore';
import type { GalleryStore } from './storage/GalleryStore';
import { createSyncClient } from './sync/createSync';
import type { SyncClient } from './sync/SyncClient';
import type { SyncStatusSnapshot } from './sync/types';
import './App.css';

const WRITER_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `web-${crypto.randomUUID().slice(0, 8)}`
    : `web-${Date.now()}`;

const REVIEWER = 'web-preview';

function useGalleryRuntime(): {
  store: GalleryStore;
  syncClient: SyncClient;
} {
  const [runtime] = useState(() => {
    const store = createGalleryStore();
    const syncClient = createSyncClient(store);
    return { store, syncClient };
  });
  return runtime;
}

export function App(): JSX.Element {
  const { store, syncClient } = useGalleryRuntime();
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<GalleryDecision | 'all'>('all');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot>(syncClient.getStatus());
  const [error, setError] = useState<string | null>(null);

  const selected = assets.find((a) => a.assetId === selectedId) ?? null;
  const stats = computeStats(assets);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await store.list();
        if (cancelled) return;
        setAssets(rows);
        setSelectedId((prev) => prev ?? rows[0]?.assetId ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => syncClient.subscribe(setSyncStatus), [syncClient]);

  useEffect(() => {
    setNotes(selected?.notes ?? '');
  }, [selected?.assetId, selected?.notes]);

  const refresh = async (): Promise<void> => {
    const rows = await store.list();
    setAssets(rows);
  };

  const onDecide = async (decision: SubmitDecision, decisionNotes?: string): Promise<void> => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.decide({
        assetId: selected.assetId,
        decision,
        notes: decisionNotes,
        reviewedBy: REVIEWER,
        writerId: WRITER_ID,
      });
      syncClient.markDirty(selected.assetId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSync = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const merged = await syncClient.sync();
      setAssets(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <SpiralAccent />
      <SyncBar
        storeKind={store.kind}
        sync={syncStatus}
        stats={stats}
        onSync={() => {
          void onSync();
        }}
        busy={busy}
      />
      {error ? (
        <p className="banner-error" role="alert">
          {error}
        </p>
      ) : null}
      <main className="layout">
        <GalleryList
          assets={assets}
          selectedId={selectedId}
          filter={filter}
          onSelect={setSelectedId}
          onFilter={setFilter}
        />
        <DecisionPanel
          asset={selected}
          notes={notes}
          busy={busy}
          onNotesChange={setNotes}
          onDecide={(decision, decisionNotes) => {
            void onDecide(decision, decisionNotes);
          }}
        />
      </main>
      <footer className="foot">
        Media Wave Technology · Gallery V1 (Love / Keep / Reject + notes). Local
        store + memory sync; cloud default Supabase (stub). See{' '}
        <code>docs/WEB-SYNC.md</code>.
      </footer>
    </div>
  );
}
