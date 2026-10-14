/**
 * The paced Nominatim search keeps the public instance's usage policy: one request a second, a
 * User-Agent naming the app with a contact address, and a repeated question asked once.
 */
import { describe, expect, it } from 'vitest';

import {
  boxAround,
  createNominatimSearch,
  MIN_REQUEST_INTERVAL_MS,
  NOMINATIM_USER_AGENT,
} from '../../src/nominatim';

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

  it('fails on a refused request so the caller can retry later', async () => {
    const search = createNominatimSearch({
      fetcher: () => Promise.resolve(new Response('', { status: 429 })),
      sleep: () => Promise.resolve(),
    });
    await expect(search({ q: 'x', box: boxAround(0, 0, 0.2) })).rejects.toThrow('429');
  });
});
