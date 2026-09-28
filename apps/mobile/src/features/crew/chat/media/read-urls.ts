/**
 * Signed read URLs for chat media (the media Worker's HMAC links, 15 minutes), minted by the api for
 * whoever can read the message, cached in memory until a minute before they expire.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, never copy. */
import { useEffect, useState } from 'react';

import type { MediaHttp } from './media-services';

const cache = new Map<string, { url: string; until: number }>();
const EARLY_MS = 60_000;

export async function readUrl(
  http: MediaHttp,
  key: string,
  now = Date.now(),
): Promise<string | null> {
  const hit = cache.get(key);
  if (hit !== undefined && hit.until > now) return hit.url;
  let response;
  try {
    response = await http.postJson('/v1/media/read-urls', { media_keys: [key] });
  } catch {
    return null;
  }
  const body = response.body as {
    urls?: { media_key: string; url: string }[];
    expires_at?: string;
  };
  const url = body.urls?.find((entry) => entry.media_key === key)?.url;
  if (response.status !== 200 || url === undefined) return null;
  const until = (body.expires_at ? Date.parse(body.expires_at) : now + 15 * 60_000) - EARLY_MS;
  cache.set(key, { url, until });
  return url;
}

/** Test-only: forgets every cached URL. */
export function clearReadUrlCache(): void {
  cache.clear();
}

export function useReadUrl(http: MediaHttp | null, key: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (http === null || key === null) return undefined;
    let live = true;
    void readUrl(http, key).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
  }, [http, key]);
  return url;
}
