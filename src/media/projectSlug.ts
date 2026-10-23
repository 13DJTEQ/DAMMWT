/**
 * Per-project gallery grouping under media/projects/<slug>/ (or projectTag).
 * Coordinates with push:media --project; works if CLI lands first or later.
 */

const MEDIA_PARTITIONS = new Set(['originals', 'tattoos', 'generated']);

/** Match `projects/<slug>/` in repo-relative, absolute, or preview URLs. */
export function projectSlugFromPath(
  pathLike: string | null | undefined
): string | null {
  if (!pathLike) return null;
  const normalized = pathLike.replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)projects\/([^/]+)(?:\/|$)/);
  const slug = match?.[1]?.trim();
  return slug || null;
}

function normalizeTags(
  tags: string[] | string | null | undefined
): string[] {
  if (Array.isArray(tags)) return tags.filter((t) => typeof t === 'string');
  if (typeof tags !== 'string' || !tags.trim()) return [];
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === 'string')
      : [];
  } catch {
    return [];
  }
}

function projectSlugFromTags(
  tags: string[] | string | null | undefined
): string | null {
  for (const tag of normalizeTags(tags)) {
    const m = tag.match(/^project:(.+)$/);
    const slug = m?.[1]?.trim();
    if (slug) return slug;
  }
  return null;
}

/**
 * Prefer path `projects/<slug>/`, then `project:<slug>` tag, then manifest
 * `project` field. Bare legacy projectTag (batch) is ignored.
 */
export function resolveProjectSlug(asset: {
  projectTag?: string | null;
  project?: string | null;
  tags?: string[] | string | null;
  localPath?: string | null;
  previewPath?: string | null;
  previewUrl?: string | null;
  sourceIdentifier?: string | null;
}): string | null {
  const fromPath =
    projectSlugFromPath(asset.localPath) ||
    projectSlugFromPath(asset.previewPath) ||
    projectSlugFromPath(asset.previewUrl) ||
    projectSlugFromPath(asset.sourceIdentifier);
  if (fromPath) return fromPath;

  const fromTag = projectSlugFromTags(asset.tags);
  if (fromTag) return fromTag;

  const project = asset.project?.trim();
  if (project && !MEDIA_PARTITIONS.has(project)) return project;

  return null;
}

/** Sorted unique project slugs present in the queue / catalog. */
export function collectProjectSlugs(
  assets: Iterable<{
    projectTag?: string | null;
    project?: string | null;
    tags?: string[] | string | null;
    localPath?: string | null;
    previewPath?: string | null;
    previewUrl?: string | null;
    sourceIdentifier?: string | null;
  }>
): string[] {
  const set = new Set<string>();
  for (const asset of assets) {
    const slug = resolveProjectSlug(asset);
    if (slug) set.add(slug);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
