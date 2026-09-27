import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signMediaUrl } from '@cp/domain';

import worker, { type Env } from './index';

const KEY_ID = 'kid-test-1';
const SECRET = 'a-test-signing-secret-not-a-real-key';
const BASE_URL = 'https://media.critterpass.app';
const OBJECT_KEY = 'critters/tokek/forest.webp';
const VARIANT = 'original';
const OBJECT_BODY = 'binary-critter-bytes';

function testEnv(): Env {
  return { ...env, MEDIA_HMAC_KEYS: JSON.stringify({ [KEY_ID]: SECRET }) };
}

async function fetchWorker(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, testEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function signedUrl(overrides: Partial<Parameters<typeof signMediaUrl>[0]> = {}) {
  return signMediaUrl({
    baseUrl: BASE_URL,
    objectKey: OBJECT_KEY,
    variant: VARIANT,
    expiresAt: Math.floor(Date.now() / 1000) + 120,
    keyId: KEY_ID,
    secret: SECRET,
    ...overrides,
  });
}

describe('media-worker signed reads', () => {
  beforeEach(async () => {
    await env.MEDIA.put(OBJECT_KEY, OBJECT_BODY, { httpMetadata: { contentType: 'image/webp' } });
  });

  afterEach(async () => {
    await env.MEDIA.delete(OBJECT_KEY);
  });

  it('streams the object with cache and etag headers for a validly signed url', async () => {
    const response = await fetchWorker(new Request(await signedUrl()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(OBJECT_BODY);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toBeTruthy();
    expect(response.headers.get('cache-control')).toMatch(/^private, max-age=\d+$/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  it('caps max-age at the time left before exp, and at one hour', async () => {
    const now = Math.floor(Date.now() / 1000);
    const soon = await fetchWorker(new Request(await signedUrl({ expiresAt: now + 90 })));
    const late = await fetchWorker(new Request(await signedUrl({ expiresAt: now + 86_400 })));

    const maxAge = (response: Response) =>
      Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
    expect(maxAge(soon)).toBeLessThanOrEqual(90);
    expect(maxAge(soon)).toBeGreaterThan(80);
    expect(maxAge(late)).toBe(3600);
  });

  it('answers HEAD with headers only', async () => {
    const response = await fetchWorker(new Request(await signedUrl(), { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBeTruthy();
    expect(await response.text()).toBe('');
  });

  it('rejects a flipped signature and a missing or malformed one with 403', async () => {
    const url = new URL(await signedUrl());
    const sig = url.searchParams.get('sig') ?? '';
    const flipped = new URL(url);
    // Flip the first character: it carries six signature bits, unlike the last one, whose low bits
    // are base64 padding.
    flipped.searchParams.set('sig', `${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`);
    const missing = new URL(url);
    missing.searchParams.delete('sig');
    const malformed = new URL(url);
    malformed.searchParams.set('sig', 'not base64url!');

    for (const candidate of [flipped, missing, malformed]) {
      expect((await fetchWorker(new Request(candidate))).status).toBe(403);
    }
  });

  it('rejects a signature minted for another object key with 403', async () => {
    const url = new URL(await signedUrl({ objectKey: 'critters/other.webp' }));
    url.pathname = `/${OBJECT_KEY}`;
    expect((await fetchWorker(new Request(url))).status).toBe(403);
  });

  it('rejects an expired signature with 403', async () => {
    const url = await signedUrl({ expiresAt: Math.floor(Date.now() / 1000) - 10 });
    const response = await fetchWorker(new Request(url));
    expect(response.status).toBe(403);
  });

  it('rejects a tampered query parameter with 403', async () => {
    const url = new URL(await signedUrl());
    url.searchParams.set('v', 'thumb');
    const response = await fetchWorker(new Request(url));
    expect(response.status).toBe(403);
  });

  it('rejects an unknown key id with 403', async () => {
    const url = await signedUrl({ keyId: 'kid-unknown' });
    const response = await fetchWorker(new Request(url));
    expect(response.status).toBe(403);
  });

  it('returns 404 for a missing object', async () => {
    const url = await signedUrl({ objectKey: 'critters/does-not-exist.webp' });
    const response = await fetchWorker(new Request(url));
    expect(response.status).toBe(404);
  });

  it('rejects non-GET/HEAD methods with 405', async () => {
    const response = await fetchWorker(new Request(await signedUrl(), { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
});
