/**
 * The real Better Auth Expo client, doubled only at the network (a recording `fetch`) and at the
 * device keychain (an in-memory store with SecureStore's shape). The api rejects any cookie-bearing
 * auth POST that lacks `expo-origin` with `403 MISSING_OR_NULL_ORIGIN`
 * (services/api/test/auth/expo-origin.db.test.ts), so every signed-in call must carry it.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createAuthDataLayer, type AuthFailure } from '..';
import { createMobileAuthClient, type MobileAuthClient } from '../client';

// expo-linking (used by the Expo client plugin for non-ID-token requests) resolves the scheme from
// the manifest embedded in a store build, which Jest has no native build to provide.
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

// The client's online manager subscribes to network changes; Jest's native-module stub returns no
// subscription to remove when the session store unmounts after the suite.
jest.mock('expo-network', () => ({
  ...jest.requireActual<object>('expo-network'),
  addNetworkStateListener: () => ({ remove: () => undefined }),
}));

const BASE_URL = 'https://api.staging.test/api/auth';
const API_URL = 'https://api.staging.test';
const SESSION_COOKIE = 'better-auth.session_token=anon-session.sig';

interface RecordedRequest {
  readonly path: string;
  readonly headers: Headers;
  readonly body: unknown;
}

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

type Responder = (path: string) => { status: number; body: unknown; setCookie?: string };

function recordingFetch(respond: Responder) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const path = url.pathname.replace('/api/auth', '');
    requests.push({ path, headers, body: raw ? JSON.parse(raw) : undefined });
    const reply = respond(path);
    const responseHeaders = new Headers({ 'content-type': 'application/json' });
    if (reply.setCookie) responseHeaders.set('set-cookie', reply.setCookie);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status, headers: responseHeaders }),
    );
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const anonymousThenOk: Responder = (path) =>
  path === '/sign-in/anonymous'
    ? {
        status: 200,
        body: { token: 'anon-session', user: { id: 'u1' } },
        setCookie: `${SESSION_COOKIE}; Path=/; HttpOnly; Secure; SameSite=Lax`,
      }
    : { status: 200, body: { status: true } };

let recorder: ReturnType<typeof recordingFetch>;
let client: MobileAuthClient;

function build(respond: Responder) {
  recorder = recordingFetch(respond);
  client = createMobileAuthClient({
    baseUrl: BASE_URL,
    scheme: 'critterpass-staging',
    storage: memoryStorage(),
    fetchImpl: recorder.fetchImpl,
  });
}

function requestTo(path: string): RecordedRequest {
  const request = recorder.requests.find((r) => r.path === path);
  if (!request) throw new Error(`no request to ${path}`);
  return request;
}

describe('the mobile auth client on a signed-in (anonymous) session', () => {
  beforeEach(async () => {
    build(anonymousThenOk);
    await client.signIn.anonymous();
  });

  it.each<['apple' | 'google', string, string]>([
    ['apple', 'apple-id-token', 'raw-nonce'],
    ['google', 'google-id-token', ''],
  ])(
    'sends link-social with an %s ID token, the session cookie and the variant origin',
    async (provider, token, nonce) => {
      await client.linkSocial({ provider, idToken: { token, nonce } });
      const request = requestTo('/link-social');
      expect(request.headers.get('expo-origin')).toBe('critterpass-staging://');
      expect(request.headers.get('cookie')).toContain(SESSION_COOKIE);
      expect(request.body).toEqual({ provider, idToken: { token, nonce } });
    },
  );

  it('sends phone OTP send and verify with the variant origin and the session cookie', async () => {
    await client.phoneNumber.sendOtp({ phoneNumber: '+84900000000' });
    await client.phoneNumber.verify({
      phoneNumber: '+84900000000',
      code: '123456',
      updatePhoneNumber: true,
    });
    for (const path of ['/phone-number/send-otp', '/phone-number/verify']) {
      const request = requestTo(path);
      expect(request.headers.get('expo-origin')).toBe('critterpass-staging://');
      expect(request.headers.get('cookie')).toContain(SESSION_COOKIE);
    }
  });

  it('sends sign-out with the variant origin and the session cookie', async () => {
    await client.signOut();
    const request = requestTo('/sign-out');
    expect(request.headers.get('expo-origin')).toBe('critterpass-staging://');
    expect(request.headers.get('cookie')).toContain(SESSION_COOKIE);
  });

  it('sends a returning ID-token sign-in with the variant origin', async () => {
    await client.signIn.social({
      provider: 'apple',
      idToken: { token: 'apple-id-token', nonce: 'raw-nonce' },
    });
    expect(requestTo('/sign-in/social').headers.get('expo-origin')).toBe('critterpass-staging://');
  });
});

describe('auth failure reporting', () => {
  it('reports the server error code when Apple linking is rejected', async () => {
    build((path) =>
      path === '/link-social'
        ? { status: 403, body: { code: 'MISSING_OR_NULL_ORIGIN', message: 'Missing origin' } }
        : anonymousThenOk(path),
    );
    await client.signIn.anonymous();
    const reported: AuthFailure[] = [];
    const auth = createAuthDataLayer(client, {
      apiBaseUrl: API_URL,
      reportFailure: (f) => void reported.push(f),
    });

    const outcome = await auth.linkApple({
      requestIdToken: () => Promise.resolve({ idToken: 'apple-id-token', nonce: 'raw-nonce' }),
    });

    expect(outcome).toEqual({ kind: 'error', code: 'MISSING_OR_NULL_ORIGIN' });
    expect(reported).toEqual([{ flow: 'link_apple', code: 'MISSING_OR_NULL_ORIGIN' }]);
  });

  it('reports a native failure by its code only, and still rejects', async () => {
    build(anonymousThenOk);
    const reported: AuthFailure[] = [];
    const auth = createAuthDataLayer(client, {
      apiBaseUrl: API_URL,
      reportFailure: (f) => void reported.push(f),
    });
    const nativeError = Object.assign(new Error('The operation couldn’t be completed.'), {
      code: 'ERR_REQUEST_UNKNOWN',
    });

    await expect(
      auth.linkApple({ requestIdToken: () => Promise.reject(nativeError) }),
    ).rejects.toBe(nativeError);
    expect(reported).toEqual([{ flow: 'link_apple', code: 'ERR_REQUEST_UNKNOWN' }]);
  });

  it('reports nothing when the user cancels the native sheet', async () => {
    build(anonymousThenOk);
    const reported: AuthFailure[] = [];
    const auth = createAuthDataLayer(client, {
      apiBaseUrl: API_URL,
      reportFailure: (f) => void reported.push(f),
    });

    await expect(
      auth.linkApple({ requestIdToken: () => Promise.resolve(undefined) }),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(reported).toEqual([]);
  });
});
