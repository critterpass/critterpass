/**
 * `readThrough` over recorded api answers: a fresh answer is `ok`, offline serves the last good
 * copy as stale (or `missing` when there never was one), and an answer that fails the wire shape is
 * never shown.
 */
import { faresResponseSchema, hazardsResponseSchema, type FaresResponse } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import {
  createLastGoodCache,
  createTravelDataReader,
  readThrough,
  type Classification,
} from '../client';
import { recorded, recordedReader } from '../test-support/recorded-reader';

let cacheId = 0;
const freshCache = () => createLastGoodCache(`travel-data-test-${String((cacheId += 1))}`);

describe('readThrough', () => {
  const path = '/v1/fares?origins=SIN%2CKUL%2CHAN&dest=bali&month=2026-11';
  const classifyFares = (data: FaresResponse): Classification =>
    data.fares.length > 0 ? { status: 'ok', seenAt: null } : { status: 'missing' };

  it('keeps the good answer and serves it as stale when the device goes offline', async () => {
    const reader = recordedReader({ '/v1/fares': [200, 'fares-bali-2026-11'] });
    const cache = freshCache();
    const args = { reader, cache, path, schema: faresResponseSchema, classify: classifyFares };
    const online = await readThrough(args);
    expect(online).toMatchObject({ status: 'ok', source: 'network' });

    reader.online = false;
    const offline = await readThrough(args);
    expect(offline).toMatchObject({ status: 'stale', source: 'cache', reason: 'offline' });
    expect(offline.status === 'stale' ? offline.data.fares : []).toHaveLength(3);
  });

  it('is missing offline when there never was a good answer', async () => {
    const reader = recordedReader({});
    reader.online = false;
    const state = await readThrough({
      reader,
      cache: freshCache(),
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(state).toEqual({ status: 'missing', reason: 'offline' });
  });

  it('turns a 404 into not_found and a server error into the last copy, marked stale', async () => {
    const cache = freshCache();
    const notFound = await readThrough({
      reader: recordedReader({ '/v1/fares': [404, 'error-not-found'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(notFound).toEqual({ status: 'missing', reason: 'not_found' });

    await readThrough({
      reader: recordedReader({ '/v1/fares': [200, 'fares-bali-2026-11'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    const failed = await readThrough({
      reader: recordedReader({ '/v1/fares': [503, 'error-not-found'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(failed).toMatchObject({ status: 'stale', reason: 'refresh_failed', source: 'cache' });
  });

  it('never shows an answer that fails the wire shape', async () => {
    const state = await readThrough({
      reader: recordedReader({ '/v1/fares': [200, 'hazards-bali'] }),
      cache: freshCache(),
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(state).toEqual({ status: 'missing', reason: 'error' });
  });
});

describe('createTravelDataReader', () => {
  it('sends the session headers and parses the recorded answer', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const reader = createTravelDataReader({
      baseUrl: 'https://api.test',
      sessionHeaders: () => Promise.resolve({ cookie: 'session=abc' }),
      fetch: (url, init) => {
        seen.push({
          url: url instanceof Request ? url.url : url.toString(),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return Promise.resolve(
          new Response(JSON.stringify(recorded('hazards-bali')), { status: 200 }),
        );
      },
    });
    const response = await reader.getJson('/v1/hazards?destination_id=bali');
    expect(response.status).toBe(200);
    expect(hazardsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(seen).toEqual([
      {
        url: 'https://api.test/v1/hazards?destination_id=bali',
        headers: { accept: 'application/json', cookie: 'session=abc' },
      },
    ]);
  });
});
