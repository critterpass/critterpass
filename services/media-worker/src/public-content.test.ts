import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import worker from './index';

const BASE_URL = 'https://media.critterpass.app';
const PUBLIC_KEY = 'c/media/0199a000-0000-7000-8000-000000000001/720.mp4';
const PRIVATE_KEY = 'u/0199a000-0000-7000-8000-000000000002/avatar/x';
const BODY = '0123456789abcdefghij';

async function fetchWorker(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, { ...env, MEDIA_HMAC_KEYS: '{}' }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('media-worker public editorial media', () => {
  beforeEach(async () => {
    await env.MEDIA.put(PUBLIC_KEY, BODY, { httpMetadata: { contentType: 'video/mp4' } });
    await env.MEDIA.put(PRIVATE_KEY, BODY);
  });

  afterEach(async () => {
    await env.MEDIA.delete(PUBLIC_KEY);
    await env.MEDIA.delete(PRIVATE_KEY);
  });

  it('serves a c/ object without a signature, cached as immutable', async () => {
    const response = await fetchWorker(new Request(`${BASE_URL}/${PUBLIC_KEY}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-length')).toBe(String(BODY.length));
  });

  it('answers a byte range with 206 and the slice', async () => {
    const response = await fetchWorker(
      new Request(`${BASE_URL}/${PUBLIC_KEY}`, { headers: { range: 'bytes=2-5' } }),
    );
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('2345');
    expect(response.headers.get('content-range')).toBe(`bytes 2-5/${BODY.length}`);
  });

  it('answers an open-ended and a suffix range', async () => {
    const open = await fetchWorker(
      new Request(`${BASE_URL}/${PUBLIC_KEY}`, { headers: { range: 'bytes=16-' } }),
    );
    expect(await open.text()).toBe('ghij');
    expect(open.headers.get('content-range')).toBe(`bytes 16-19/${BODY.length}`);
    const suffix = await fetchWorker(
      new Request(`${BASE_URL}/${PUBLIC_KEY}`, { headers: { range: 'bytes=-3' } }),
    );
    expect(await suffix.text()).toBe('hij');
    expect(suffix.headers.get('content-range')).toBe(`bytes 17-19/${BODY.length}`);
  });

  it('answers HEAD with the length and no body', async () => {
    const response = await fetchWorker(
      new Request(`${BASE_URL}/${PUBLIC_KEY}`, { method: 'HEAD' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(BODY.length));
    expect(await response.text()).toBe('');
  });

  it('returns 404 for a missing c/ object', async () => {
    const response = await fetchWorker(new Request(`${BASE_URL}/c/media/missing.webp`));
    expect(response.status).toBe(404);
  });

  it('still refuses an unsigned read outside c/', async () => {
    const response = await fetchWorker(new Request(`${BASE_URL}/${PRIVATE_KEY}`));
    expect(response.status).toBe(403);
  });

  it('refuses a c/ path that climbs out of the prefix', async () => {
    const response = await fetchWorker(new Request(`${BASE_URL}/c/%2E%2E/${PRIVATE_KEY}`));
    expect(response.status).toBe(403);
  });
});
