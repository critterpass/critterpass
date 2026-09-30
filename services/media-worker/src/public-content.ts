/**
 * The public `c/` prefix: editorial media (licensed stock stills and video loops) that every
 * reader may load without a signed URL. Keys hold the asset id and never change content, so they
 * are cached for a year as immutable. Video players read by byte range, so a `Range` request gets
 * a 206 with the requested slice.
 */
export const PUBLIC_PREFIX = 'c/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function isPublicKey(objectKey: string): boolean {
  return objectKey.startsWith(PUBLIC_PREFIX) && !objectKey.split('/').includes('..');
}

function headersFor(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', IMMUTABLE);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  return headers;
}

function slice(range: R2Range, size: number): { start: number; end: number } {
  // The runtime fills every field of the range, the unused ones undefined.
  const { offset, length, suffix } = range as { offset?: number; length?: number; suffix?: number };
  if (suffix !== undefined) return { start: Math.max(0, size - suffix), end: size - 1 };
  const start = offset ?? 0;
  return { start, end: Math.min(size, start + (length ?? size - start)) - 1 };
}

export async function servePublic(
  request: Request,
  bucket: R2Bucket,
  objectKey: string,
): Promise<Response> {
  if (request.method === 'HEAD') {
    const object = await bucket.head(objectKey);
    if (object === null) return new Response('Not Found', { status: 404 });
    const headers = headersFor(object);
    headers.set('content-length', String(object.size));
    return new Response(null, { status: 200, headers });
  }
  const ranged = request.headers.has('range');
  let object: R2ObjectBody | null;
  try {
    object = await bucket.get(objectKey, ranged ? { range: request.headers } : {});
  } catch {
    // R2 refuses an unsatisfiable or malformed range.
    const head = await bucket.head(objectKey);
    if (head === null) return new Response('Not Found', { status: 404 });
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${head.size}` },
    });
  }
  if (object === null) return new Response('Not Found', { status: 404 });
  const headers = headersFor(object);
  if (ranged && object.range !== undefined) {
    const { start, end } = slice(object.range, object.size);
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
    headers.set('content-length', String(end - start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}
