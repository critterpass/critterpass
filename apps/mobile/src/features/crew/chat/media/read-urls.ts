/**
 * Signed read URLs for chat and album media (the media Worker's HMAC links, 15 minutes), minted by
 * the api for whoever can read them and cached in memory until a minute before they expire, so a
 * picture keeps one URL for its link's lifetime. Keys asked for in the same tick go out as one
 * request (a grid of thumbnails is one call, not one per tile), and a key already on its way is
 * never asked for twice.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, never copy. */
import { useEffect, useState } from 'react';

import type { MediaHttp } from './media-services';

const cache = new Map<string, { url: string; until: number }>();
const EARLY_MS = 60_000;
/** The api takes this many keys in one request. */
const BATCH_MAX = 100;

interface Waiter {
  readonly resolve: (url: string) => void;
  readonly reject: (error: unknown) => void;
}

interface Batch {
  readonly keys: Map<string, Waiter>;
}

/** Keys waiting for this tick's request, and keys already asked for, per api client. */
const waiting = new Map<MediaHttp, Batch>();
const inFlight = new Map<MediaHttp, Map<string, Promise<string>>>();

async function send(http: MediaHttp, keys: readonly string[], now: number): Promise<void> {
  const flying = inFlight.get(http);
  const batch = waiting.get(http);
  const waiters = keys.map((key) => batch?.keys.get(key));
  for (const key of keys) batch?.keys.delete(key);
  try {
    const response = await http.postJson('/v1/media/read-urls', { media_keys: keys });
    const body = response.body as {
      urls?: { media_key: string; url: string }[];
      expires_at?: string;
    } | null;
    if (response.status !== 200) throw new Error(`read-urls ${response.status}`);
    const until = (body?.expires_at ? Date.parse(body.expires_at) : now + 15 * 60_000) - EARLY_MS;
    const urls = new Map((body?.urls ?? []).map((entry) => [entry.media_key, entry.url]));
    keys.forEach((key, index) => {
      const url = urls.get(key);
      if (url === undefined) {
        waiters[index]?.reject(new Error('read-urls: no url for the key'));
        return;
      }
      cache.set(key, { url, until });
      waiters[index]?.resolve(url);
    });
  } catch (error) {
    for (const waiter of waiters) waiter?.reject(error);
  } finally {
    for (const key of keys) flying?.delete(key);
  }
}

function flush(http: MediaHttp, now: number): void {
  const batch = waiting.get(http);
  if (batch === undefined) return;
  const keys = [...batch.keys.keys()];
  for (let at = 0; at < keys.length; at += BATCH_MAX) {
    void send(http, keys.slice(at, at + BATCH_MAX), now);
  }
  waiting.delete(http);
}

/** The key's signed URL; rejects when the api cannot be reached or will not mint it. */
function request(http: MediaHttp, key: string, now: number): Promise<string> {
  const hit = cache.get(key);
  if (hit !== undefined && hit.until > now) return Promise.resolve(hit.url);
  let flying = inFlight.get(http);
  if (flying === undefined) {
    flying = new Map();
    inFlight.set(http, flying);
  }
  const already = flying.get(key);
  if (already !== undefined) return already;
  let batch = waiting.get(http);
  if (batch === undefined) {
    batch = { keys: new Map() };
    waiting.set(http, batch);
    // Everything asked for before the current work yields goes out together.
    queueMicrotask(() => flush(http, now));
  }
  const keys = batch.keys;
  const promise = new Promise<string>((resolve, reject) => {
    keys.set(key, { resolve, reject });
  });
  flying.set(key, promise);
  return promise;
}

/** The key's signed URL, or null when it could not be minted (offline, or not the caller's to read). */
export async function readUrl(
  http: MediaHttp,
  key: string,
  now = Date.now(),
): Promise<string | null> {
  try {
    return await request(http, key, now);
  } catch {
    return null;
  }
}

/** Test-only: forgets every cached URL and anything waiting. */
export function clearReadUrlCache(): void {
  cache.clear();
  waiting.clear();
  inFlight.clear();
}

export function useReadUrl(http: MediaHttp | null, key: string | null): string | null {
  const [read, setRead] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (http === null || key === null) return undefined;
    let live = true;
    void readUrl(http, key).then((url) => {
      if (live) setRead({ key, url });
    });
    return () => {
      live = false;
    };
  }, [http, key]);
  // A recycled row never shows the previous key's picture.
  return read !== null && read.key === key ? read.url : null;
}
