/**
 * What a copied link is and whether to offer it (7d-1 "FROM YOUR CLIPBOARD"): the first web link
 * in the text, from a platform Add from a link reads (TikTok, YouTube, Instagram, Google or Apple
 * Maps), and not one already imported on this phone. Imported links are kept as hashes only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- host names and storage keys, never copy. */
import type { ImportPlatform } from '@cp/domain';

import { searchStore } from '@/data/places/search-store';

export type LinkPlatform = Exclude<ImportPlatform, 'screenshot' | 'web'>;

export interface ClipboardLink {
  readonly url: string;
  readonly platform: LinkPlatform;
  /** "tiktok.com/@balibites/video/7419…" */
  readonly display: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/iu;
const IMPORTED_KEY = 'imported_links';
const IMPORTED_MAX = 200;
const DISPLAY_MAX = 34;

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m)\./u, '');
}

export function platformOf(url: URL): LinkPlatform | null {
  const host = hostOf(url);
  const path = url.pathname.toLowerCase();
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    return 'youtube';
  }
  if (host === 'instagram.com' || host === 'instagr.am') return 'instagram';
  if (host === 'maps.apple.com' || host === 'maps.apple') return 'apple_maps';
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && path.startsWith('/maps'))) {
    return 'google_maps';
  }
  if (
    /^(maps\.)?google\.[a-z.]+$/u.test(host) &&
    (host.startsWith('maps.') || path.startsWith('/maps'))
  ) {
    return 'google_maps';
  }
  return null;
}

/** The first link in `text` that Add from a link reads, or null. */
export function classifyLink(text: string | null): ClipboardLink | null {
  if (text === null) return null;
  const match = URL_PATTERN.exec(text);
  if (match === null) return null;
  let url: URL;
  try {
    url = new URL(match[0].replace(/[).,!?]+$/u, ''));
  } catch {
    return null;
  }
  const platform = platformOf(url);
  if (platform === null) return null;
  const bare = `${hostOf(url)}${url.pathname}`.replace(/\/$/u, '');
  const display = bare.length > DISPLAY_MAX ? `${bare.slice(0, DISPLAY_MAX - 1)}…` : bare;
  return { url: url.toString(), platform, display };
}

export interface TypedLink {
  readonly url: string;
  /** A platform Add from a link reads, or any other web page. */
  readonly platform: LinkPlatform | 'web';
  readonly display: string;
}

/** Hosts people paste without `https://` (a share sheet's short link, a typed address). */
const BARE_LINK =
  /(?:^|\s)((?:www\.)?(?:[a-z0-9-]+\.)*(?:tiktok\.com|instagram\.com|instagr\.am|youtube\.com|youtu\.be|maps\.app\.goo\.gl|goo\.gl|maps\.apple\.com|google\.[a-z.]{2,6})\/[^\s<>"']+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<>"']+)/iu;

function shortOf(url: URL): string {
  const bare = `${hostOf(url)}${url.pathname}`.replace(/\/$/u, '');
  return bare.length > DISPLAY_MAX ? `${bare.slice(0, DISPLAY_MAX - 1)}…` : bare;
}

/**
 * The link in what was typed or pasted into the search field, when the text is one: any web
 * address with its scheme, alone or among a share sheet's words, or a post or map link pasted
 * without one. A link is added from, never searched for by name or as a street address.
 */
export function typedLink(text: string): TypedLink | null {
  const withScheme = URL_PATTERN.exec(text)?.[0];
  const bare = withScheme === undefined ? BARE_LINK.exec(text)?.[1] : undefined;
  const raw = withScheme ?? (bare === undefined ? undefined : `https://${bare}`);
  if (raw === undefined) return null;
  let url: URL;
  try {
    url = new URL(raw.replace(/[).,!?]+$/u, ''));
  } catch {
    return null;
  }
  if (!url.hostname.includes('.')) return null;
  return { url: url.toString(), platform: platformOf(url) ?? 'web', display: shortOf(url) };
}

/** FNV-1a over the link without its query noise, so the same post copied twice hashes the same. */
export function linkHash(url: string): string {
  let parsed: string;
  try {
    const value = new URL(url);
    parsed = `${hostOf(value)}${value.pathname.replace(/\/$/u, '')}`;
  } catch {
    parsed = url;
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < parsed.length; index += 1) {
    hash ^= parsed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function importedHashes(): string[] {
  try {
    const saved = searchStore().getString(IMPORTED_KEY);
    const parsed: unknown = saved === undefined ? [] : JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function wasImported(url: string): boolean {
  return importedHashes().includes(linkHash(url));
}

export function markImported(url: string): void {
  const hash = linkHash(url);
  const kept = importedHashes().filter((entry) => entry !== hash);
  searchStore().set(IMPORTED_KEY, JSON.stringify([...kept, hash].slice(-IMPORTED_MAX)));
}

/** The link to offer from the clipboard's text: a readable platform, not imported yet. */
export function clipboardOffer(text: string | null): ClipboardLink | null {
  const link = classifyLink(text);
  return link === null || wasImported(link.url) ? null : link;
}
