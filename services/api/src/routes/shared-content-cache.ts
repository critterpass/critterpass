/**
 * The answer every shared-content read gives (docs/api-contracts.md §5.5): five minutes of private
 * cache and a strong ETag over the body, so a phone that sends `If-None-Match` gets a bodiless 304
 * until the reviewed content changes.
 */
import { createHash } from 'node:crypto';

import type { Context } from 'hono';

export const SHARED_CONTENT_CACHE_CONTROL = 'private, max-age=300';

export function sharedContentEtag(body: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('base64url');
  return `"${digest.slice(0, 27)}"`;
}

export function sendSharedContent(c: Context, body: object): Response {
  const etag = sharedContentEtag(body);
  c.header('ETag', etag);
  c.header('Cache-Control', SHARED_CONTENT_CACHE_CONTROL);
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  return c.json(body);
}
