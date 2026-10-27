import type { GalleryAsset } from '../domain/gallery';

/**
 * CRDT-lite conflict policy (documented + implemented for merge):
 *
 * 1. Higher `revision` wins.
 * 2. On equal revision, later `updatedAt` (ISO lexicographic) wins.
 * 3. On equal revision + timestamp, lexicographically greater `lastWriterId` wins
 *    (deterministic tie-break across clients — not a full CRDT, but convergent).
 *
 * Notes and status are atomic with the record (LWW whole-document merge).
 * Field-level CRDTs are intentionally out of scope for this scaffold.
 */
export function pickWinner(local: GalleryAsset, remote: GalleryAsset): GalleryAsset {
  if (remote.revision !== local.revision) {
    return remote.revision > local.revision ? remote : local;
  }
  if (remote.updatedAt !== local.updatedAt) {
    return remote.updatedAt > local.updatedAt ? remote : local;
  }
  return remote.lastWriterId >= local.lastWriterId ? remote : local;
}

export function mergeAssetMaps(
  local: readonly GalleryAsset[],
  remote: readonly GalleryAsset[],
): GalleryAsset[] {
  const byId = new Map<string, GalleryAsset>();
  for (const asset of local) {
    byId.set(asset.assetId, asset);
  }
  for (const remoteAsset of remote) {
    const existing = byId.get(remoteAsset.assetId);
    byId.set(
      remoteAsset.assetId,
      existing ? pickWinner(existing, remoteAsset) : remoteAsset,
    );
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
