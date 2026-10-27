/**
 * Path / URL guards for Electron shell actions.
 * Never call shell.showItemInFolder / openPath / openExternal without these checks.
 */
import { existsSync, realpathSync } from 'fs';
import { isAbsolute, normalize, resolve, sep } from 'path';

export interface ShellActionResult {
  ok: boolean;
  error?: string;
  resolvedPath?: string;
}

export interface ShellBridge {
  showItemInFolder(fullPath: string): void;
  openPath(fullPath: string): Promise<string>;
  openExternal(url: string): Promise<void>;
}

/**
 * Resolve candidate under an allowed root. Rejects traversal and non-files outside roots.
 */
export function resolveUnderAllowedRoots(
  candidate: string,
  allowedRoots: readonly string[]
): ShellActionResult {
  if (!candidate || typeof candidate !== 'string') {
    return { ok: false, error: 'Path is required' };
  }
  if (candidate.includes('\0')) {
    return { ok: false, error: 'Invalid path' };
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return { ok: false, error: 'Path is required' };
  }

  // file:// URLs from previewUrl / older rows — strip to filesystem path
  let input = trimmed;
  if (/^file:/i.test(input)) {
    try {
      input = decodeURIComponent(new URL(input).pathname);
      // Windows file URLs may start with /C:/…
      if (/^\/[A-Za-z]:\//.test(input)) {
        input = input.slice(1);
      }
    } catch {
      return { ok: false, error: 'Invalid file URL' };
    }
  }

  const absolute = isAbsolute(input) ? normalize(input) : resolve(input);

  let realTarget: string;
  try {
    // Prefer realpath when the file exists (resolves symlinks).
    realTarget = existsSync(absolute)
      ? realpathSync(absolute)
      : absolute;
  } catch {
    return { ok: false, error: 'Path could not be resolved' };
  }

  const roots = allowedRoots
    .filter(Boolean)
    .map((root) => {
      try {
        return existsSync(root) ? realpathSync(root) : resolve(root);
      } catch {
        return resolve(root);
      }
    });

  if (roots.length === 0) {
    return { ok: false, error: 'No allowed media roots configured' };
  }

  const underRoot = roots.some((root) => {
    const prefix = root.endsWith(sep) ? root : root + sep;
    return realTarget === root || realTarget.startsWith(prefix);
  });

  if (!underRoot) {
    return { ok: false, error: 'Path is outside allowed media roots' };
  }

  if (!existsSync(realTarget)) {
    return { ok: false, error: 'File does not exist', resolvedPath: realTarget };
  }

  return { ok: true, resolvedPath: realTarget };
}

const ALLOWED_EXTERNAL = new Set(['http:', 'https:']);

export function assertSafeExternalUrl(url: string): ShellActionResult {
  if (!url || typeof url !== 'string') {
    return { ok: false, error: 'URL is required' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (!ALLOWED_EXTERNAL.has(parsed.protocol)) {
    return { ok: false, error: `Protocol not allowed: ${parsed.protocol}` };
  }
  return { ok: true };
}

export async function safeRevealInFolder(
  shell: ShellBridge,
  candidate: string,
  allowedRoots: readonly string[]
): Promise<ShellActionResult> {
  const checked = resolveUnderAllowedRoots(candidate, allowedRoots);
  if (!checked.ok || !checked.resolvedPath) {
    return checked;
  }
  shell.showItemInFolder(checked.resolvedPath);
  return { ok: true, resolvedPath: checked.resolvedPath };
}

export async function safeOpenPath(
  shell: ShellBridge,
  candidate: string,
  allowedRoots: readonly string[]
): Promise<ShellActionResult> {
  const checked = resolveUnderAllowedRoots(candidate, allowedRoots);
  if (!checked.ok || !checked.resolvedPath) {
    return checked;
  }
  const err = await shell.openPath(checked.resolvedPath);
  if (err) {
    return { ok: false, error: err, resolvedPath: checked.resolvedPath };
  }
  return { ok: true, resolvedPath: checked.resolvedPath };
}

export async function safeOpenExternal(
  shell: ShellBridge,
  url: string
): Promise<ShellActionResult> {
  const checked = assertSafeExternalUrl(url);
  if (!checked.ok) {
    return checked;
  }
  await shell.openExternal(url.trim());
  return { ok: true };
}
