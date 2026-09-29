/**
 * The exact URLs the real Better Auth Expo client sends the app's own auth routes to, built the way
 * the device builds it (the api origin only, as `resolveApiBaseUrl` returns it). The client
 * prefixes Better Auth's `/api/auth` base path to relative paths, so a path that already carries it
 * lands on `/api/auth/api/auth/…` and 404s: tokens, the returning phone sign-in and the merge
 * routes must each reach their real path. Doubled only at the network (a recording `fetch`) and
 * the keychain (an in-memory store).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { authRouteUrl, createAuthDataLayer, jwtExpiresAtMs, type AuthDataLayer } from '..';
import { createMobileAuthClient } from '../client';

jest.mock('expo-constants', () => {
  const actual = jest.requireActual<{ default: object }>('expo-constants');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      executionEnvironment: 'standalone',
      expoConfig: { scheme: 'critterpass-staging' },
    },
  };
});

jest.mock('expo-network', () => ({
  ...jest.requireActual<object>('expo-network'),
  addNetworkStateListener: () => ({ remove: () => undefined }),
}));

const API_URL = 'https://api.staging.test';
const EXP = 1_900_000_000;
/** `{"sub":"u1","aud":"sync","exp":1900000000}`, base64url, with a `-`/`_`-free payload. */
const TOKEN = `h.${Buffer.from(JSON.stringify({ sub: 'u1', aud: 'sync', exp: EXP })).toString('base64url')}.s`;

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    getItemAsync: (key: string) => Promise.resolve(items.get(key) ?? null),
    setItem: (key: string, value: string) => void items.set(key, value),
    setItemAsync: (key: string, value: string) => {
      items.set(key, value);
      return Promise.resolve();
    },
  };
}

let urls: string[];
let auth: AuthDataLayer;

function reply(url: URL): unknown {
  if (url.pathname === '/api/auth/token') return { token: TOKEN };
  if (url.pathname === '/v1/auth/merge-ticket')
    return { crews: 1, trips: 0, critters: 2, stamps: 0 };
  return { user: { id: 'u1' } };
}

beforeEach(() => {
  urls = [];
  const client = createMobileAuthClient({
    baseUrl: API_URL,
    scheme: 'critterpass-staging',
    storage: memoryStorage(),
    fetchImpl: (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input);
      urls.push(url.href);
      return Promise.resolve(
        new Response(JSON.stringify(reply(url)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  });
  auth = createAuthDataLayer(client, { apiBaseUrl: API_URL, reportFailure: () => undefined });
});

describe('auth routes through the real client', () => {
  it('mints sync and realtime tokens at /api/auth/token', async () => {
    await expect(auth.getSyncToken()).resolves.toBe(TOKEN);
    await expect(auth.getRealtimeToken()).resolves.toBe(TOKEN);
    expect(urls).toEqual([
      `${API_URL}/api/auth/token?aud=sync`,
      `${API_URL}/api/auth/token?aud=rt`,
    ]);
  });

  it('signs a returning phone in at /api/auth/sign-in/phone-number', async () => {
    await auth.signInReturningPhone({ phoneNumber: '+6591234567', code: '123456' });
    expect(urls).toEqual([`${API_URL}/api/auth/sign-in/phone-number`]);
  });

  it('previews and runs a merge at /v1/auth/merge-ticket and /v1/auth/merge', async () => {
    await auth.startMerge('ticket');
    await auth.confirmMerge('ticket');
    expect(urls).toEqual([`${API_URL}/v1/auth/merge-ticket`, `${API_URL}/v1/auth/merge`]);
  });
});

describe('auth route helpers', () => {
  it('keeps Better Auth paths relative and makes the routes beside it absolute', () => {
    expect(authRouteUrl(API_URL, '/api/auth/token?aud=rt')).toBe('/token?aud=rt');
    expect(authRouteUrl(API_URL, '/v1/auth/merge')).toBe(`${API_URL}/v1/auth/merge`);
  });

  it("reads a token's expiry without Buffer, whatever its base64url padding", () => {
    expect(jwtExpiresAtMs(TOKEN)).toBe(EXP * 1000);
    const odd = `h.${Buffer.from(JSON.stringify({ exp: EXP, n: 'ab' })).toString('base64url')}.s`;
    expect(jwtExpiresAtMs(odd)).toBe(EXP * 1000);
  });
});
