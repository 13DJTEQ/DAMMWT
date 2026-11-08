import type { GalleryAsset } from '../domain/gallery';
import {
  buildLineageChain,
  displayTitle,
  partitionLabel,
} from '../media/manifest';

interface LineageTrailProps {
  asset: GalleryAsset;
  assets: readonly GalleryAsset[];
  onSelect: (assetId: string) => void;
}

/**
 * Generation history: current asset → parents → Source of Truth original.
 */
export function LineageTrail({
  asset,
  assets,
  onSelect,
}: LineageTrailProps): JSX.Element | null {
  const byId = new Map(assets.map((a) => [a.assetId, a]));
  const chain = buildLineageChain(asset, byId);
  const hasHistory = Boolean(asset.parentSourceId) || chain.length > 1;
  if (!hasHistory && asset.partition !== 'originals') {
    return null;
  }

  const root = chain[chain.length - 1];
  const isSoT =
    !asset.parentSourceId &&
    (asset.partition === 'originals' || root?.assetId === asset.assetId);

  return (
    <aside className="lineage" aria-label="Generation history">
      <header className="lineage__header">
        <h3>Generation history</h3>
        {isSoT ? (
          <span className="lineage__badge">Source of Truth</span>
        ) : (
          <span className="lineage__badge lineage__badge--trace">
            Trace to SoT
          </span>
        )}
      </header>
      {isSoT && chain.length === 1 ? (
        <p className="lineage__note">
          This asset is an original / Source of Truth seed. Downstream tattoos
          and generations link back here via <code>parentSourceId</code>.
        </p>
      ) : (
        <ol className="lineage__chain">
          {chain.map((node, index) => {
            const isCurrent = index === 0;
            const isRoot = index === chain.length - 1;
            const role = isCurrent
              ? 'Current'
              : isRoot
                ? 'Source of Truth'
                : 'Parent';
            return (
              <li key={node.assetId} className="lineage__step">
                {!isCurrent ? (
                  <span className="lineage__arrow" aria-hidden>
                    ← from
                  </span>
                ) : null}
                <button
                  type="button"
                  className={
                    isCurrent
                      ? 'lineage__node lineage__node--current'
                      : 'lineage__node'
                  }
                  onClick={() => onSelect(node.assetId)}
                  disabled={isCurrent}
                >
                  <img
                    src={node.previewUrl}
                    alt=""
                    className="lineage__thumb"
                  />
                  <span className="lineage__meta">
                    <strong>{displayTitle(node)}</strong>
                    <span className="muted">
                      {role}
                      {node.partition
                        ? ` · ${partitionLabel(node.partition)}`
                        : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
