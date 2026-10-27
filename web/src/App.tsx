import { useEffect, useMemo, useState } from 'react';
import { DecisionPanel } from './components/DecisionPanel';
import {
  GalleryList,
  type ProjectFilter,
  type SectionFilter,
} from './components/GalleryList';
import { SpiralAccent } from './components/SpiralAccent';
import { SyncBar } from './components/SyncBar';
import {
  computeStats,
  type GalleryAsset,
  type GalleryDecision,
  type MediaPartition,
  type SubmitDecision,
} from './domain/gallery';
import {
  fetchMediaManifest,
  projectSlugsFromManifest,
} from './media/manifest';
import { collectProjectSlugs } from './media/projectSlug';
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

const SECTION_ORDER: MediaPartition[] = [
  'originals',
  'tattoos',
  'generated',
];

function pickDefaultSection(assets: GalleryAsset[]): SectionFilter {
  const counts = new Map<MediaPartition, number>();
  for (const asset of assets) {
    const p = asset.partition ?? 'tattoos';
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  // Prefer a non-empty queue: Tattoos → Originals → Generated → all
  for (const key of ['tattoos', 'originals', 'generated'] as const) {
    if ((counts.get(key) ?? 0) > 0) return key;
  }
  return 'all';
}

export function App(): JSX.Element {
  const [store, setStore] = useState<GalleryStore | null>(null);
  const [syncClient, setSyncClient] = useState<SyncClient | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<SectionFilter>('tattoos');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [filter, setFilter] = useState<GalleryDecision | 'all'>('all');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registeredProjects, setRegisteredProjects] = useState<string[]>([]);

  const selected = assets.find((a) => a.assetId === selectedId) ?? null;
  const stats = computeStats(assets);

  const availableProjects = useMemo(
    () => collectProjectSlugs(assets, registeredProjects),
    [assets, registeredProjects],
  );

  const availableSections = useMemo(() => {
    const present = new Set<MediaPartition>();
    for (const asset of assets) {
      present.add(asset.partition ?? 'tattoos');
    }
    const ordered = SECTION_ORDER.filter((p) => present.has(p));
    // Never leave the nav empty — always show Originals + Tattoos at minimum.
    if (ordered.length === 0) return ['originals', 'tattoos'] as MediaPartition[];
    if (!ordered.includes('originals')) ordered.unshift('originals');
    if (!ordered.includes('tattoos')) {
      const insertAt = ordered[0] === 'originals' ? 1 : 0;
      ordered.splice(insertAt, 0, 'tattoos');
    }
    return ordered;
  }, [assets]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nextStore = await createGalleryStore();
        const nextSync = createSyncClient(nextStore);
        const [rows, manifest] = await Promise.all([
          nextStore.list(),
          fetchMediaManifest(),
        ]);
        if (cancelled) return;
        setStore(nextStore);
        setSyncClient(nextSync);
        setSyncStatus(nextSync.getStatus());
        setAssets(rows);
        setRegisteredProjects(projectSlugsFromManifest(manifest));
        const defaultSection = pickDefaultSection(rows);
        setSection(defaultSection);
        const inSection =
          defaultSection === 'all'
            ? rows
            : rows.filter((a) => (a.partition ?? 'tattoos') === defaultSection);
        setSelectedId(inSection[0]?.assetId ?? rows[0]?.assetId ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!syncClient) return;
    return syncClient.subscribe(setSyncStatus);
  }, [syncClient]);

  useEffect(() => {
    setNotes(selected?.notes ?? '');
  }, [selected?.assetId, selected?.notes]);

  const refresh = async (): Promise<void> => {
    if (!store) return;
    const rows = await store.list();
    setAssets(rows);
  };

  const onDecide = async (
    decision: SubmitDecision,
    decisionNotes?: string,
  ): Promise<void> => {
    if (!selected || !store || !syncClient || busy) return;
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
    if (!syncClient) return;
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

  const onSection = (next: SectionFilter): void => {
    setSection(next);
    const inSection =
      next === 'all'
        ? assets
        : assets.filter((a) => (a.partition ?? 'tattoos') === next);
    if (
      selectedId &&
      inSection.some((a) => a.assetId === selectedId)
    ) {
      return;
    }
    setSelectedId(inSection[0]?.assetId ?? null);
  };

  return (
    <div className="app-shell">
      <SpiralAccent />
      {store && syncStatus ? (
        <SyncBar
          storeKind={store.kind}
          sync={syncStatus}
          stats={stats}
          onSync={() => {
            void onSync();
          }}
          busy={busy || booting}
        />
      ) : (
        <header className="sync-bar" aria-label="Loading gallery">
          <div className="brand">
            <p className="brand__name">
              Media <span>Wave</span>
            </p>
            <span className="brand__sub">Loading curated media…</span>
          </div>
        </header>
      )}
      {error ? (
        <p className="banner-error" role="alert">
          {error}
        </p>
      ) : null}
      <main className="layout">
        <GalleryList
          assets={assets}
          selectedId={selectedId}
          section={section}
          filter={filter}
          projectFilter={projectFilter}
          availableSections={availableSections}
          availableProjects={availableProjects}
          onSelect={setSelectedId}
          onSection={onSection}
          onFilter={setFilter}
          onProject={setProjectFilter}
        />
        <DecisionPanel
          asset={selected}
          assets={assets}
          notes={notes}
          busy={busy || booting}
          onNotesChange={setNotes}
          onDecide={(decision, decisionNotes) => {
            void onDecide(decision, decisionNotes);
          }}
          onSelectAsset={setSelectedId}
        />
      </main>
      <footer className="foot">
        Media Wave Technology · Gallery V1 (Love / Keep / Reject + notes).
        Sections: Originals / Source of Truth, Tattoos, Generated. Seeded from{' '}
        <code>/media/manifest.json</code>. See <code>docs/WEB-SYNC.md</code>.
      </footer>
    </div>
  );
}
