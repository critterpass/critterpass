import { describe, expect, it } from '@jest/globals';

import { eraseAccount, type EraseAccountDeps } from '../erase-account';

/** The server's answers as its contract gives them. */
const PURGED = {
  purged: true,
  user_id: '0199a5c2-7b10-7c44-9d2e-3f1a6b8c4d10',
  deletion_id: '0199a5c2-7b11-7e02-8a41-5c9d2e7f1a33',
  purged_at: '2026-10-01T11:42:07.000Z',
};
const error = (code: string, message: string, detail?: Record<string, unknown>) => ({
  error: { code, message, retryable: false, ...(detail === undefined ? {} : { detail }) },
});

function server(status: number, body: unknown) {
  const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
  const deps: EraseAccountDeps = {
    baseUrl: 'https://api.staging.example',
    sessionHeaders: () => Promise.resolve({ cookie: 'session=abc' }),
    fetch: (url, init) => {
      requests.push({ url, method: init.method, headers: init.headers });
      return Promise.resolve({ status, json: () => Promise.resolve(body) });
    },
  };
  return { deps, requests };
}

describe('eraseAccount', () => {
  it('posts to the purge route as the signed-in session and reports the account erased', async () => {
    const { deps, requests } = server(200, PURGED);
    expect(await eraseAccount(deps)).toBe('erased');
    expect(requests).toEqual([
      {
        url: 'https://api.staging.example/v1/me/deletion/purge-now',
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'session=abc' },
      },
    ]);
  });

  it('reports a server without the route, so the caller can say the account stays', async () => {
    expect(await eraseAccount(server(404, error('NOT_FOUND', 'Not found')).deps)).toBe(
      'unavailable',
    );
  });

  it('reports a phone without a valid session', async () => {
    expect(await eraseAccount(server(401, error('AUTH_REQUIRED', 'Sign in')).deps)).toBe(
      'signed_out',
    );
  });

  it('stops with the reason when the server is production', async () => {
    const refused = server(
      403,
      error('FORBIDDEN', 'Not available on this server', { reason: 'production' }),
    );
    await expect(eraseAccount(refused.deps)).rejects.toThrow(
      'FORBIDDEN (production): Not available on this server',
    );
  });

  it('stops when rate limited', async () => {
    await expect(
      eraseAccount(server(429, error('RATE_LIMITED', 'Slow down')).deps),
    ).rejects.toThrow('RATE_LIMITED: Slow down');
  });

  it('stops when a 200 does not say the account was purged', async () => {
    await expect(eraseAccount(server(200, {}).deps)).rejects.toThrow('HTTP 200');
  });

  it('stops when the server cannot be reached', async () => {
    const { deps } = server(200, PURGED);
    const offline = { ...deps, fetch: () => Promise.reject(new Error('Network request failed')) };
    await expect(eraseAccount(offline)).rejects.toThrow('Network request failed');
  });
});
