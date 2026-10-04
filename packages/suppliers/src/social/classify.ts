/**
 * Which platform a pasted link is from, by host and path only (no request): TikTok, YouTube,
 * Instagram, Google Maps (full and short links), Apple Maps, else a plain web page. Anything that
 * is not an http(s) URL is not a link.
 */
import type { ImportPlatform } from '@cp/domain';

export type LinkPlatform = Exclude<ImportPlatform, 'screenshot'>;

export interface ClassifiedLink {
  readonly platform: LinkPlatform;
  readonly url: URL;
  /** A Google Maps short link: its place is only in the redirect. */
  readonly short?: boolean;
}

const bare = (host: string) => host.toLowerCase().replace(/^(www\.|m\.|mobile\.)/u, '');

export function classifyLink(raw: string): ClassifiedLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = bare(url.hostname);
  if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return { platform: 'tiktok', url };
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    return { platform: 'youtube', url };
  }
  if (host === 'instagram.com' || host === 'instagr.am') return { platform: 'instagram', url };
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'))) {
    return { platform: 'google_maps', url, short: true };
  }
  if (
    host === 'maps.google.com' ||
    (/^google\.[a-z.]+$/u.test(host) && url.pathname.startsWith('/maps'))
  ) {
    return { platform: 'google_maps', url };
  }
  if (host === 'maps.apple.com' || host === 'maps.apple') return { platform: 'apple_maps', url };
  return { platform: 'web', url };
}
