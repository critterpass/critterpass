/**
 * Any place read through the api with the last good copy on the phone: an answer is kept and
 * served offline as stale, a place the api does not know is missing, the copies stay bounded, and
 * a profile fact resting on one source asks to be checked.
 */
import { describe, expect, it } from '@jest/globals';

import { createLastGoodCache } from '../../travel-data/client';
import { recordedReader } from '../../travel-data/test-support/recorded-reader';
import { placePath, readPlace, singleSource } from '../place-read';

const PLACE = '0199b7a0-4c1e-7d2a-8f00-3a6b5c4d2e11';
let cacheId = 0;
const freshCache = (max?: number) =>
  createLastGoodCache(
    `place-read-test-${String((cacheId += 1))}`,
    max === undefined ? {} : { max },
  );

describe('readPlace', () => {
  it('reads a place the phone does not hold, then opens it offline from the kept copy', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'place-open-data-with-profile'] });
    const cache = freshCache();
    const online = await readPlace(reader, PLACE, { cache });
    expect(online).toMatchObject({ status: 'ok', data: { id: PLACE, name: 'Chùa Linh Ứng' } });
    reader.online = false;
    const offline = await readPlace(reader, PLACE, { cache });
    expect(offline).toMatchObject({ status: 'stale', reason: 'offline', source: 'cache' });
    expect(reader.paths).toEqual([placePath(PLACE), placePath(PLACE)]);
  });

  it('says missing for a place the api does not know, and offline when never seen', async () => {
    const gone = recordedReader({ '/v1/places/': [404, 'error-not-found'] });
    await expect(readPlace(gone, PLACE, { cache: freshCache() })).resolves.toEqual({
      status: 'missing',
      reason: 'not_found',
    });
    const away = recordedReader({});
    away.online = false;
    await expect(readPlace(away, PLACE, { cache: freshCache() })).resolves.toEqual({
      status: 'missing',
      reason: 'offline',
    });
  });

  it('keeps only the newest copies past the bound', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'place-open-data-with-profile'] });
    const cache = freshCache(2);
    for (const id of ['a', 'b', 'a', 'c']) await readPlace(reader, id, { cache });
    expect(cache.get(placePath('b'))).toBeUndefined();
    expect(cache.get(placePath('a'))).toBeDefined();
    expect(cache.get(placePath('c'))).toBeDefined();
  });
});

describe('profile facts', () => {
  it('asks to check a fact with one source; a fee or hours line has two behind it', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'place-open-data-with-profile'] });
    const state = await readPlace(reader, PLACE, { cache: freshCache() });
    const profile = state.status === 'ok' ? state.data.profile : null;
    if (profile?.status !== 'ready') throw new Error('expected a ready profile');
    expect(profile.facts.map((fact) => [fact.kind, singleSource(fact)])).toEqual([
      ['entry', false],
      ['dress', true],
    ]);
    const entry = profile.facts[0]!;
    expect(singleSource({ ...entry, secondSource: 'no' })).toBe(true);
    expect(singleSource({ ...entry, kind: 'know', secondSource: 'agrees' })).toBe(false);
  });
});
