import { verifyMediaSignature } from '@cp/domain';

export interface Env {
  readonly MEDIA_HMAC_KEYS: string;
  readonly MEDIA: R2Bucket;
}

const MAX_CACHE_SECONDS = 3600;
const ALLOWED_METHODS = 'GET, HEAD';

/** Parses the `MEDIA_HMAC_KEYS` secret (`{kid: secret}`); any malformed value yields no keys. */
function parseHmacKeys(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

/** Recovers the R2 object key from the request path; `undefined` for an unparseable path. */
function decodeObjectKey(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch {
    return undefined;
  }
}

function cacheControlFor(exp: number, now: number): string {
  const remaining = Math.max(0, Math.min(exp - now, MAX_CACHE_SECONDS));
  return `private, max-age=${remaining}`;
}

function objectHeaders(object: R2Object, exp: number, now: number): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', cacheControlFor(exp, now));
  return headers;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: ALLOWED_METHODS },
      });
    }

    const url = new URL(request.url);
    const objectKey = decodeObjectKey(url.pathname);
    if (objectKey === undefined) {
      return new Response('Forbidden', { status: 403 });
    }

    const exp = Number(url.searchParams.get('exp'));
    const now = Math.floor(Date.now() / 1000);
    const verification = await verifyMediaSignature({
      objectKey,
      variant: url.searchParams.get('v') ?? '',
      exp,
      kid: url.searchParams.get('kid') ?? '',
      sig: url.searchParams.get('sig') ?? '',
      keys: parseHmacKeys(env.MEDIA_HMAC_KEYS),
      now,
    });
    if (verification.status !== 'ok') {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'HEAD') {
      const object = await env.MEDIA.head(objectKey);
      if (object === null) return new Response('Not Found', { status: 404 });
      return new Response(null, { status: 200, headers: objectHeaders(object, exp, now) });
    }

    const object = await env.MEDIA.get(objectKey);
    if (object === null) return new Response('Not Found', { status: 404 });
    return new Response(object.body, { status: 200, headers: objectHeaders(object, exp, now) });
  },
};
