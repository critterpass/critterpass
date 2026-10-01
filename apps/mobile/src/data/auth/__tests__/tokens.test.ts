import { describe, expect, it, jest } from '@jest/globals';

import { createTokenCache, type TokenClient } from '../tokens';

describe('createTokenCache', () => {
  it('fetches once and reuses the cached token before the refresh-ahead window', async () => {
    let now = 0;
    const getToken = jest
      .fn<TokenClient['getToken']>()
      .mockResolvedValue({ token: 'token-1', expiresAtMs: 15 * 60_000 });
    const client: TokenClient = { getToken };
    const cache = createTokenCache(client, () => now);

    await expect(cache.getToken('sync')).resolves.toBe('token-1');
    now = 5 * 60_000;
    await expect(cache.getToken('sync')).resolves.toBe('token-1');
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes 60s before expiry', async () => {
    let now = 0;
    const getToken = jest
      .fn<TokenClient['getToken']>()
      .mockResolvedValueOnce({ token: 'token-1', expiresAtMs: 15 * 60_000 })
      .mockResolvedValueOnce({ token: 'token-2', expiresAtMs: 30 * 60_000 });
    const client: TokenClient = { getToken };
    const cache = createTokenCache(client, () => now);

    await expect(cache.getToken('sync')).resolves.toBe('token-1');
    now = 15 * 60_000 - 59_000; // inside the 60s refresh-ahead window
    await expect(cache.getToken('sync')).resolves.toBe('token-2');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('caches sync and rt independently', async () => {
    const getToken = jest
      .fn<TokenClient['getToken']>()
      .mockImplementation((aud) =>
        Promise.resolve({ token: `token-${aud}`, expiresAtMs: 15 * 60_000 }),
      );
    const client: TokenClient = { getToken };
    const cache = createTokenCache(client, () => 0);

    await expect(cache.getToken('sync')).resolves.toBe('token-sync');
    await expect(cache.getToken('rt')).resolves.toBe('token-rt');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces the next call to refetch', async () => {
    const getToken = jest
      .fn<TokenClient['getToken']>()
      .mockResolvedValue({ token: 'token-1', expiresAtMs: 15 * 60_000 });
    const client: TokenClient = { getToken };
    const cache = createTokenCache(client, () => 0);

    await cache.getToken('sync');
    cache.invalidate();
    await cache.getToken('sync');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('counts a fetch that never answers as failed, and a later fetch still succeeds', async () => {
    jest.useFakeTimers();
    try {
      const getToken = jest
        .fn<TokenClient['getToken']>()
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce({ token: 'token-2', expiresAtMs: 15 * 60_000 });
      const cache = createTokenCache({ getToken }, () => 0, 15_000);

      const hung = cache.getToken('sync');
      const settled = expect(hung).rejects.toThrow('did not answer within 15000 ms');
      jest.advanceTimersByTime(15_000);
      await settled;
      expect(getToken.mock.calls[0]?.[1].aborted).toBe(true);

      await expect(cache.getToken('sync')).resolves.toBe('token-2');
      expect(getToken).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
