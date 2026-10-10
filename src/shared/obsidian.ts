import type { Settings } from './settings';

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

export interface ObsidianTarget {
  path: string;
  absolute: boolean;
  vault: string;
}

function destinationError(key: string, value: string): never {
  const localized = typeof chrome === 'undefined' ? '' : chrome.i18n.getMessage(key, value);
  throw new Error(localized && localized !== key ? localized : `${key}: ${JSON.stringify(value)}`);
}

function validateSegment(segment: string): void {
  if (!segment || segment === '.' || segment === '..' ||
      /[<>:"/\\|?*\u0000-\u001f]/.test(segment) || /[. ]$/.test(segment) || WINDOWS_DEVICE.test(segment)) {
    destinationError('obsidian_invalid_path', segment);
  }
}

function unquoteFolder(folder: string): string {
  const trimmed = folder.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed).replace(/\\/g, '/');
}

export function isAbsoluteObsidianFolder(folder: string): boolean {
  return /^(?:[a-z]:\/|\/)/i.test(unquoteFolder(folder));
}

// Shared by the popup and content-script entry points. Only computes a path;
// it neither reads the filesystem nor claims that a vault exists there.
export function resolveObsidianTarget(
  filename: string,
  settings: Pick<Settings, 'obsidianFolder' | 'obsidianVault' | 'obsidianGroupByAuthor'>,
  handle: string,
): ObsidianTarget {
  validateSegment(filename);
  const folder = unquoteFolder(settings.obsidianFolder);
  const absolute = isAbsoluteObsidianFolder(settings.obsidianFolder);
  let prefix = '';
  let remainder = folder;
  if (/^[a-z]:\//i.test(folder)) {
    prefix = folder.slice(0, 3);
    remainder = folder.slice(3);
  } else if (folder.startsWith('//')) {
    prefix = '//';
    remainder = folder.slice(2);
    if (remainder.split('/').filter(Boolean).length < 2) destinationError('obsidian_invalid_path', folder);
  } else if (folder.startsWith('/')) {
    prefix = '/';
    remainder = folder.slice(1);
  }
  const segments = remainder.split('/').filter(Boolean);
  segments.forEach(validateSegment);
  if (settings.obsidianGroupByAuthor) {
    // DOM extraction uses bare "unknown" as its failure sentinel. The real
    // account @unknown remains valid and must not be conflated with it.
    if (handle.trim() === 'unknown') destinationError('obsidian_invalid_author', handle);
    const account = handle.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(account)) destinationError('obsidian_invalid_author', handle);
    // @ cannot occur in an account identifier, so this cannot collide with a
    // real account (unlike adding an underscore to a Windows device name).
    segments.push(WINDOWS_DEVICE.test(account) ? `@${account}` : account);
  }
  segments.push(filename);
  return { path: prefix + segments.join('/'), absolute, vault: settings.obsidianVault.trim() };
}

export function buildObsidianTargetUrl(content: string | null, target: ObsidianTarget): string {
  if (!target.absolute) return buildObsidianUrl(content, target.path, target.vault);
  const body = content === null ? 'clipboard=true' : `content=${encodeURIComponent(content)}`;
  return `obsidian://new?path=${encodeURIComponent(target.path)}&${body}`;
}

// Normalize a user-entered vault subfolder: backslashes → forward slashes,
// strip empty / `.` / `..` segments to block traversal, collapse repeated
// slashes, drop leading and trailing slashes. Returns "" for unusable input.
function sanitizeVaultFolder(folder: string): string {
  return folder
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

// Build an `obsidian://new` deeplink. Each value uses `encodeURIComponent`
// (percent-encoding) rather than URLSearchParams form-encoding — the
// `obsidian://` URI handler treats `+` as a literal plus sign, so a
// form-encoded query would dump literal `+` characters all over the
// rendered note's body, frontmatter, and tags. A null body requests Obsidian's
// clipboard handoff; callers must finish copying before opening that URL.
export function buildObsidianUrl(
  content: string | null,
  filename: string,
  vault: string,
  folder = ''
): string {
  const fileNoExt = filename.replace(/\.md$/, '');
  const cleanFolder = sanitizeVaultFolder(folder);
  const filePath = cleanFolder ? `${cleanFolder}/${fileNoExt}` : fileNoExt;
  const parts: string[] = [];
  if (vault) parts.push(`vault=${encodeURIComponent(vault)}`);
  parts.push(`file=${encodeURIComponent(filePath)}`);
  parts.push(content === null ? 'clipboard=true' : `content=${encodeURIComponent(content)}`);
  return `obsidian://new?${parts.join('&')}`;
}
