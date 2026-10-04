/**
 * Social and maps link readers for Add from a link (docs/api-contracts-planning.md, imports):
 * classify a pasted URL, then read a post's text from its platform's embed or a place from a maps
 * link. Platforms the server config leaves out answer `unsupported` (the app asks for a
 * screenshot), as does any plain web page. Nothing read here is stored.
 */
import type { ImportPlatform } from '@cp/domain';

import { classifyLink, type LinkPlatform } from './classify';
import { SocialReadError } from './http';
import { parseAppleMapsUrl, parseGoogleMapsUrl, resolveShortMapsLink, type MapPlace } from './maps';
import { readOembed, readPost, type PostReaderDeps, type SocialPost } from './posts';

export { classifyLink, type ClassifiedLink, type LinkPlatform } from './classify';
export { SOCIAL_TIMEOUT_MS, SocialReadError, type SocialFetch } from './http';
export { parseAppleMapsUrl, parseGoogleMapsUrl, resolveShortMapsLink, type MapPlace } from './maps';
export {
  OEMBED_URLS,
  readPost,
  youtubeVideoId,
  type PostPlatform,
  type PostReaderDeps,
  type SocialPost,
} from './posts';

export interface LinkReaderDeps extends PostReaderDeps {
  /** `imports.platforms`: the link platforms read; any other answers `unsupported`. */
  readonly platforms: readonly ImportPlatform[];
}

export type LinkRead =
  | { readonly kind: 'post'; readonly post: SocialPost }
  | {
      readonly kind: 'map';
      readonly platform: 'google_maps' | 'apple_maps';
      readonly place: MapPlace;
    }
  | {
      readonly kind: 'needs_screenshot';
      readonly platform: LinkPlatform;
      readonly title: string | null;
      readonly author: string | null;
      readonly thumbUrl: string | null;
    }
  | { readonly kind: 'unsupported'; readonly platform: LinkPlatform | null }
  /** Private, deleted or not a post; or the platform did not answer. */
  | {
      readonly kind: 'unreadable';
      readonly platform: LinkPlatform;
      readonly reason: SocialReadError['reason'];
    };

export async function readLink(raw: string, deps: LinkReaderDeps): Promise<LinkRead> {
  const link = classifyLink(raw);
  if (link === null) return { kind: 'unsupported', platform: null };
  const { platform, url } = link;
  if (platform === 'web' || !deps.platforms.includes(platform)) {
    return { kind: 'unsupported', platform };
  }
  try {
    if (platform === 'google_maps') {
      const full = link.short === true ? await resolveShortMapsLink(url, deps.fetch) : url;
      const place = full === null ? null : parseGoogleMapsUrl(full);
      return place === null
        ? { kind: 'unreadable', platform, reason: 'not_found' }
        : { kind: 'map', platform, place };
    }
    if (platform === 'apple_maps') {
      const place = parseAppleMapsUrl(url);
      return place === null
        ? { kind: 'unreadable', platform, reason: 'not_found' }
        : { kind: 'map', platform, place };
    }
    return await readPost(platform, url, deps);
  } catch (error) {
    if (error instanceof SocialReadError)
      return { kind: 'unreadable', platform, reason: error.reason };
    return { kind: 'unreadable', platform, reason: 'not_found' };
  }
}

export interface LinkPreview {
  readonly platform: LinkPlatform;
  readonly title: string | null;
  readonly author: string | null;
  readonly thumbUrl: string | null;
}

/**
 * What the clipboard card shows before an import: the post's oEmbed title, author and thumbnail,
 * or a maps link's place name from the URL itself. No model, no Data API, no redirect follow.
 */
export async function previewLink(
  raw: string,
  deps: Pick<LinkReaderDeps, 'fetch' | 'instagramToken'>,
): Promise<LinkPreview | null> {
  const link = classifyLink(raw);
  if (link === null) return null;
  const empty: LinkPreview = { platform: link.platform, title: null, author: null, thumbUrl: null };
  try {
    if (link.platform === 'tiktok' || link.platform === 'youtube') {
      return { platform: link.platform, ...(await readOembed(link.platform, link.url, deps)) };
    }
    if (link.platform === 'instagram' && (deps.instagramToken ?? '') !== '') {
      return { platform: link.platform, ...(await readOembed('instagram', link.url, deps)) };
    }
    if (link.platform === 'google_maps' && link.short !== true) {
      return { ...empty, title: parseGoogleMapsUrl(link.url)?.name ?? null };
    }
    if (link.platform === 'apple_maps') {
      return { ...empty, title: parseAppleMapsUrl(link.url)?.name ?? null };
    }
  } catch {
    return empty;
  }
  return empty;
}
