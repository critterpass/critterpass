/* eslint-disable lingui/no-unlocalized-strings -- keys, paths and metadata names, not UI copy. */
/**
 * OG image cache in R2 (`OG_CACHE`). Keys never carry a link token or any internal id: each is
 * `HMAC-SHA256(OG_CACHE_SECRET, kind ‖ id ‖ template version)` in hex, so a bucket listing reveals
 * nothing and a stale template version never collides with a new one. Each object records the
 * digest of the content it was drawn from; a different digest means redraw.
 */

/** The slice of an R2 bucket binding this cache uses. */
export interface OgBucket {
  get(key: string): Promise<{
    readonly customMetadata?: Record<string, string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function ogCacheKey(
  secret: string,
  kind: string,
  id: string,
  version: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${kind}\u0000${id}\u0000${version}`),
  );
  return `og/${hex(signature)}.png`;
}

/** Digest of what a card shows, so a changed crew or title redraws the card under the same key. */
export async function contentDigest(content: unknown): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(content))));
}

export type CacheRead = { readonly hit: true; readonly png: ArrayBuffer } | { readonly hit: false };

export async function readCached(
  bucket: OgBucket,
  key: string,
  digest: string,
): Promise<CacheRead> {
  const object = await bucket.get(key);
  if (object === null || object.customMetadata?.['digest'] !== digest) return { hit: false };
  return { hit: true, png: await object.arrayBuffer() };
}

export async function writeCached(
  bucket: OgBucket,
  key: string,
  digest: string,
  png: Uint8Array,
): Promise<void> {
  await bucket.put(key, png, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: { digest },
  });
}
