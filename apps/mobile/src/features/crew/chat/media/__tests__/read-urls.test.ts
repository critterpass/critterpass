/**
 * Signed read URLs: keys asked for in one tick share one request, a key on its way is not asked
 * for again, a URL is reused until it is about to expire, and a failed request fails every key
 * that was waiting on it.
 */
import type { MediaHttp } from '../media-services';
import { clearReadUrlCache, readUrl } from '../read-urls';

const NOW = Date.parse('2026-10-08T10:00:00Z');

function api(answer: (keys: string[]) => { status: number; body: unknown } | Error) {
  const calls: string[][] = [];
  const http: MediaHttp = {
    postJson: async (_path, body) => {
      const keys = (body as { media_keys: string[] }).media_keys;
      calls.push(keys);
      const result = answer(keys);
      if (result instanceof Error) throw result;
      return result;
    },
    put: async () => ({ status: 200, body: null, etag: null }),
  };
  return { http, calls };
}

const minted = (keys: string[], expires = '2026-10-08T10:15:00Z') => ({
  status: 200,
  body: {
    urls: keys.map((key) => ({ media_key: key, url: `https://media.test/${key}?sig=1` })),
    expires_at: expires,
  },
});

beforeEach(() => clearReadUrlCache());

describe('readUrl', () => {
  it('asks once for every key wanted in the same tick', async () => {
    const { http, calls } = api((keys) => minted(keys));
    const urls = await Promise.all(['a', 'b', 'c', 'a'].map((key) => readUrl(http, key, NOW)));
    expect(calls).toEqual([['a', 'b', 'c']]);
    expect(urls).toEqual([
      'https://media.test/a?sig=1',
      'https://media.test/b?sig=1',
      'https://media.test/c?sig=1',
      'https://media.test/a?sig=1',
    ]);
  });

  it('splits more keys than one request takes', async () => {
    const { http, calls } = api((keys) => minted(keys));
    const keys = Array.from({ length: 230 }, (_, index) => `k${index}`);
    const urls = await Promise.all(keys.map((key) => readUrl(http, key, NOW)));
    expect(calls.map((call) => call.length)).toEqual([100, 100, 30]);
    expect(urls.every((url) => url !== null)).toBe(true);
  });

  it('shares a request that is still on its way', async () => {
    let release: (() => void) | undefined;
    const calls: string[][] = [];
    const http: MediaHttp = {
      postJson: async (_path, body) => {
        const keys = (body as { media_keys: string[] }).media_keys;
        calls.push(keys);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return minted(keys);
      },
      put: async () => ({ status: 200, body: null, etag: null }),
    };
    const first = readUrl(http, 'a', NOW);
    await Promise.resolve();
    await Promise.resolve();
    const second = readUrl(http, 'a', NOW);
    release?.();
    expect(await Promise.all([first, second])).toEqual([
      'https://media.test/a?sig=1',
      'https://media.test/a?sig=1',
    ]);
    expect(calls).toEqual([['a']]);
  });

  it('keeps one URL until a minute before it expires, then asks again', async () => {
    const { http, calls } = api((keys) => minted(keys));
    await readUrl(http, 'a', NOW);
    await readUrl(http, 'a', NOW + 13 * 60_000);
    expect(calls).toHaveLength(1);
    await readUrl(http, 'a', NOW + 14 * 60_000 + 1);
    expect(calls).toHaveLength(2);
  });

  it('fails every key waiting on a request that failed, and asks again next time', async () => {
    let down = true;
    const { http, calls } = api((keys) => (down ? new Error('offline') : minted(keys)));
    expect(await Promise.all(['a', 'b'].map((key) => readUrl(http, key, NOW)))).toEqual([
      null,
      null,
    ]);
    down = false;
    expect(await readUrl(http, 'a', NOW)).toBe('https://media.test/a?sig=1');
    expect(calls).toEqual([['a', 'b'], ['a']]);
  });

  it('gives nothing for keys the api refuses, or leaves out of its answer', async () => {
    const refused = api(() => ({ status: 404, body: { error: { code: 'NOT_FOUND' } } }));
    expect(await readUrl(refused.http, 'a', NOW)).toBeNull();
    const partial = api(() => minted(['a']));
    expect(await Promise.all(['a', 'b'].map((key) => readUrl(partial.http, key, NOW)))).toEqual([
      'https://media.test/a?sig=1',
      null,
    ]);
  });
});
