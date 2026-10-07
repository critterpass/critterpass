import { describe, expect, it } from 'vitest';

import { fetchPublicPerks, PERKS_FRESH_MS } from './perks';

const PERK = {
  key: 'boost_live_map',
  tier: 'boost',
  copy_key: 'monetize.perks.boost_live_map',
  sort: 120,
};
const answer = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('fetchPublicPerks', () => {
  it('keeps one answer for a few minutes, then asks again', async () => {
    let calls = 0;
    let time = 1_000;
    const request = {
      apiBaseUrl: 'https://api.kept.test',
      now: () => time,
      fetchImpl: (() => {
        calls += 1;
        return answer({ perks: [PERK] });
      }) as typeof fetch,
    };
    expect(await fetchPublicPerks(request)).toEqual([PERK]);
    time += PERKS_FRESH_MS - 1;
    expect(await fetchPublicPerks(request)).toEqual([PERK]);
    expect(calls).toBe(1);
    time += 2;
    await fetchPublicPerks(request);
    expect(calls).toBe(2);
  });

  it('uses the last answer when the api fails later, and none when it never answered', async () => {
    let time = 1_000;
    let fail = false;
    const request = {
      apiBaseUrl: 'https://api.stale.test',
      now: () => time,
      fetchImpl: (() =>
        fail ? Promise.reject(new Error('down')) : answer({ perks: [PERK] })) as typeof fetch,
    };
    expect(await fetchPublicPerks(request)).toEqual([PERK]);
    fail = true;
    time += PERKS_FRESH_MS + 1;
    expect(await fetchPublicPerks(request)).toEqual([PERK]);
    expect(await fetchPublicPerks({ ...request, apiBaseUrl: 'https://api.never.test' })).toBeNull();
  });

  it('reads nothing from an answer that is not the catalogue or an error status', async () => {
    const wrong = {
      apiBaseUrl: 'https://api.wrong.test',
      fetchImpl: (() => answer({ perks: [{ key: 1 }] })) as typeof fetch,
    };
    expect(await fetchPublicPerks(wrong)).toBeNull();
    const limited = {
      apiBaseUrl: 'https://api.limited.test',
      fetchImpl: (() => answer({}, 429)) as typeof fetch,
    };
    expect(await fetchPublicPerks(limited)).toBeNull();
  });
});
