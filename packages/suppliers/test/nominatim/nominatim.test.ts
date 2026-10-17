/**
 * The paced Nominatim search keeps the public instance's usage policy: one request a second, a
 * User-Agent naming the app with a contact address, a repeated question asked once, and a pause
 * that grows while the instance refuses.
 */
import { describe, expect, it } from 'vitest';

import {
  boxAround,
  createNominatimSearch,
  MAX_BACKOFF_MS,
  MIN_REQUEST_INTERVAL_MS,
  nominatimLookupUrl,
  NOMINATIM_USER_AGENT,
  REFUSED_ATTEMPTS,
  REFUSED_BACKOFF_MS,
} from '../../src/nominatim';

/** A search on a fake clock answering `statuses` in turn (then 200), recording when each call went. */
function scripted(statuses: readonly (number | [number, string])[]) {
  let clock = 0;
  const at: number[] = [];
  const left = [...statuses];
  const fetcher = (() => {
    at.push(clock);
    const next = left.shift() ?? 200;
    const [status, retryAfter] = typeof next === 'number' ? [next, null] : next;
    const headers: Record<string, string> =
      retryAfter === null ? {} : { 'Retry-After': retryAfter };
    return Promise.resolve(new Response(status === 200 ? '[]' : '', { status, headers }));
  }) as typeof fetch;
  const search = createNominatimSearch({
    fetcher,
    now: () => clock,
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
  });
  const gaps = () => at.slice(1).map((t, i) => t - at[i]!);
  return { search, at, gaps };
}

const box = boxAround(0, 0, 0.2);

describe('the paced Nominatim search', () => {
  it('spaces requests a second apart, names itself and asks a repeated question once', async () => {
    let clock = 0;
    const calls: { url: string; agent: string | null; at: number }[] = [];
    const fetcher = ((url: string, init?: RequestInit) => {
      calls.push({ url, agent: new Headers(init?.headers).get('User-Agent'), at: clock });
      return Promise.resolve(new Response('[]', { status: 200 }));
    }) as typeof fetch;
    const search = createNominatimSearch({
      fetcher,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    const query = { q: 'Hoover Dam', box: boxAround(36.016, -114.7377, 0.2) };
    await Promise.all([search(query), search({ ...query, q: 'Boulder Dam' }), search(query)]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL_MS);
    expect(calls.every((call) => call.agent === NOMINATIM_USER_AGENT)).toBe(true);
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toMatchObject({
      q: 'Hoover Dam',
      format: 'jsonv2',
      addressdetails: '1',
      namedetails: '1',
      extratags: '1',
      bounded: '1',
      viewbox: '-114.9377,36.2160,-114.5377,35.8160',
    });
  });

  it('waits a doubling pause after refused or failing answers, then asks again', async () => {
    const { search, gaps } = scripted([429, 503]);
    await expect(search({ q: 'a', box })).resolves.toEqual([]);
    expect(gaps()).toEqual([REFUSED_BACKOFF_MS, 2 * REFUSED_BACKOFF_MS]);
    await search({ q: 'b', box });
    expect(gaps().at(-1)).toBe(MIN_REQUEST_INTERVAL_MS);
  });

  it('gives up after its attempts and keeps the pause for the next question', async () => {
    const refusals = Array.from({ length: REFUSED_ATTEMPTS + 1 }, () => 429);
    const { search, at, gaps } = scripted(refusals);
    await expect(search({ q: 'a', box })).rejects.toThrow('429');
    expect(at).toHaveLength(REFUSED_ATTEMPTS);
    await expect(search({ q: 'b', box })).resolves.toEqual([]);
    expect(gaps()).toEqual([
      REFUSED_BACKOFF_MS,
      2 * REFUSED_BACKOFF_MS,
      4 * REFUSED_BACKOFF_MS,
      8 * REFUSED_BACKOFF_MS,
      MAX_BACKOFF_MS,
    ]);
  });

  it("waits at least the answer's Retry-After", async () => {
    const { search, gaps } = scripted([[429, '1800']]);
    await search({ q: 'a', box });
    expect(gaps()).toEqual([1_800_000]);
  });

  it('throws at once on a request the instance rejects for good', async () => {
    const { search, at } = scripted([400]);
    await expect(search({ q: 'a', box })).rejects.toThrow('400');
    expect(at).toHaveLength(1);
  });

  it('looks an element up by id through the same turns, and answers null when it is gone', async () => {
    let clock = 0;
    const calls: { url: string; at: number }[] = [];
    const fetcher = ((url: string) => {
      calls.push({ url, at: clock });
      const body = url.includes('/lookup') && url.includes('W42') ? '[{"osm_id":42}]' : '[]';
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;
    const client = createNominatimSearch({
      fetcher,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    const [found, gone] = await Promise.all([
      client.lookup('way/42'),
      client.lookup('node/7'),
      client({ q: 'a', box }),
    ]);
    expect(found).toMatchObject({ osm_id: 42 });
    expect(gone).toBeNull();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.at - calls[1]!.at).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL_MS);
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toMatchObject({
      osm_ids: 'W42',
      format: 'jsonv2',
      namedetails: '1',
      extratags: '1',
    });
    expect(() => nominatimLookupUrl('way/abc')).toThrow();
  });
});
