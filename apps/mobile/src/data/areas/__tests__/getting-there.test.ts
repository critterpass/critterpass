/**
 * Reading the ways from a home city to a destination: answers of
 * `GET /v1/destinations/{id}/getting-there` in their recorded shape, the copy kept for offline,
 * and a failure that is never passed off as "no way found".
 */
import { describe, expect, it } from '@jest/globals';

import type { LastGoodCache, TravelDataReader } from '@/data/travel-data/client';

import { gettingTherePath, readGettingThere, sourcesOf } from '../getting-there';
import none from './fixtures/getting-there-none.json';
import pending from './fixtures/getting-there-pending.json';
import ready from './fixtures/getting-there-sgn-da-nang.json';

const DA_NANG = '0192f000-0000-7000-8000-0000000da4a4';
const path = gettingTherePath(DA_NANG, 'SGN') ?? '';

function memoryCache(): LastGoodCache & { readonly keys: () => string[] } {
  const kept = new Map<string, { savedAt: string; body: unknown }>();
  return {
    get: (key) => kept.get(key),
    set: (key, body, savedAt) => void kept.set(key, { savedAt: savedAt.toISOString(), body }),
    keys: () => [...kept.keys()],
  };
}

const answers = (status: number, body: unknown): TravelDataReader => ({
  getJson: () => Promise.resolve({ status, body }),
});
const unreachable: TravelDataReader = {
  getJson: () => Promise.reject(new Error('network down')),
};

describe('gettingTherePath', () => {
  it('names the pair of places and nothing about the reader', () => {
    expect(path).toBe(`/v1/destinations/${DA_NANG}/getting-there?from=SGN`);
    expect(gettingTherePath(DA_NANG, null)).toBeNull();
    expect(gettingTherePath(null, 'SGN')).toBeNull();
  });
});

describe('readGettingThere', () => {
  it('reads each way with its time, cost and pages, leaving out a mode it does not know', async () => {
    const read = await readGettingThere({
      reader: answers(200, ready),
      cache: memoryCache(),
      path,
    });
    if (read.status !== 'ready') throw new Error(`read ${read.status}`);
    expect(read.origin).toEqual({ key: 'SGN', city: 'Ho Chi Minh City' });
    expect(read.saved).toBe(false);
    expect(read.generatedAt).toBe('2026-10-05T08:12:00.000Z');
    expect(read.ways.map((way) => [way.mode, way.minutes, way.cost])).toEqual([
      ['flight', 85, { amountMinor: 1200000, currency: 'VND' }],
      ['train', 1020, { amountMinor: 900000, currency: 'VND' }],
      ['bus', 1140, null],
    ]);
    expect(sourcesOf(read.ways)).toEqual([
      {
        url: 'https://example.vn/ho-chi-minh-to-da-nang',
        title: 'Ho Chi Minh City to Da Nang: every way to go',
      },
      { url: 'https://rail.example.com/saigon-danang', title: null },
    ]);
  });

  it('answers pending while the estimate is written, and keeps nothing', async () => {
    const cache = memoryCache();
    const read = await readGettingThere({ reader: answers(200, pending), cache, path });
    expect(read).toEqual({ status: 'pending' });
    expect(cache.keys()).toEqual([]);
  });

  it('says so when no cited way was found', async () => {
    const read = await readGettingThere({ reader: answers(200, none), cache: memoryCache(), path });
    expect(read).toEqual({ status: 'none', origin: { key: 'SGN', city: 'Ho Chi Minh City' } });
  });

  it('shows the kept ways when the api cannot be reached', async () => {
    const cache = memoryCache();
    await readGettingThere({ reader: answers(200, ready), cache, path });
    const offline = await readGettingThere({ reader: unreachable, cache, path });
    expect(offline).toMatchObject({ status: 'ready', saved: true });
    const signedOut = await readGettingThere({ reader: null, cache, path });
    expect(signedOut).toMatchObject({ status: 'ready', saved: true });
  });

  it('reports a failure as a failure when nothing is kept', async () => {
    const cache = memoryCache();
    expect(await readGettingThere({ reader: unreachable, cache, path })).toEqual({
      status: 'failed',
      reason: 'offline',
    });
    expect(await readGettingThere({ reader: answers(500, null), cache, path })).toEqual({
      status: 'failed',
      reason: 'error',
    });
    expect(await readGettingThere({ reader: answers(200, { ways: 'soon' }), cache, path })).toEqual(
      { status: 'failed', reason: 'error' },
    );
  });
});
