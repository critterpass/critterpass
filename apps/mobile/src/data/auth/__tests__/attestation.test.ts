/**
 * Device attestation through the real Better Auth Expo client: the api attests anonymous sign-in
 * and OTP send (services/api/src/auth/hooks.ts), so only those two carry the headers. Doubled at
 * the network (a recording `fetch`), the keychain and `@expo/app-integrity`'s native boundary.
 */
import { describe, expect, it, jest } from '@jest/globals';

import { createAttestor, type AttestationNativeModule } from '../../../lib/attestation';
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

const BASE_URL = 'https://api.staging.test/api/auth';
const INSTALL_ID = '0192f7a0-0000-7000-8000-000000000002';
const ATTESTATION_HEADERS = [
  'x-cp-install-id',
  'x-cp-platform',
  'x-cp-challenge',
  'x-cp-attestation',
  'x-cp-key-id',
  'x-cp-assertion',
  'x-cp-integrity-token',
  'x-cp-attestation-unavailable',
];

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    getItemAsync: (key: string) => Promise.resolve(items.get(key) ?? null),
    setItem: (key: string, value: string) => void items.set(key, value),
    setItemAsync: (key: string, value: string) => Promise.resolve(void items.set(key, value)),
  };
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

function setup(respond: (path: string, headers: Headers) => Reply, supported = true) {
  const requests: { path: string; headers: Headers }[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const path = url.pathname.replace('/api/auth', '');
    requests.push({ path, headers });
    const reply = respond(path, headers);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof fetch;

  const generateKeyAsync = jest.fn(() => Promise.resolve('key-1'));
  const attestKeyAsync = jest.fn((_key: string, challenge: string) =>
    Promise.resolve(`attestation-over-${challenge}`),
  );
  const native: AttestationNativeModule = {
    isSupported: supported,
    generateKeyAsync,
    attestKeyAsync,
    generateAssertionAsync: (_key, challenge) => Promise.resolve(`assertion-over-${challenge}`),
    prepareIntegrityTokenProviderAsync: () => Promise.resolve(),
    requestIntegrityCheckAsync: (hash) => Promise.resolve(`token-over-${hash}`),
  };
  let keyId: string | null = null;
  let issued = 0;
  const fetchChallenge = jest.fn(() => Promise.resolve(`challenge-${++issued}`));
  const attestor = createAttestor({
    platform: 'ios',
    native,
    installId: () => Promise.resolve(INSTALL_ID),
    fetchChallenge,
    keyStore: {
      get: () => Promise.resolve(keyId),
      set: (value) => Promise.resolve(void (keyId = value)),
      clear: () => Promise.resolve(void (keyId = null)),
    },
  });
  const client = createMobileAuthClient({
    baseUrl: BASE_URL,
    scheme: 'critterpass-staging',
    storage: memoryStorage(),
    fetchImpl,
    attestor,
  });
  const to = (path: string) => requests.filter((r) => r.path === path);
  return { client, requests, to, generateKeyAsync, attestKeyAsync, fetchChallenge };
}

const ok = (): Reply => ({ status: 200, body: { token: 't', user: { id: 'u1' }, status: true } });

describe('attestation on auth requests', () => {
  it('attests anonymous sign-in once, then asserts on OTP send', async () => {
    const { client, to, attestKeyAsync } = setup(ok);

    await client.signIn.anonymous();
    await client.phoneNumber.sendOtp({ phoneNumber: '+84900000000' });

    const [signIn] = to('/sign-in/anonymous');
    expect(signIn?.headers.get('x-cp-install-id')).toBe(INSTALL_ID);
    expect(signIn?.headers.get('x-cp-platform')).toBe('ios');
    expect(signIn?.headers.get('x-cp-challenge')).toBe('challenge-1');
    expect(signIn?.headers.get('x-cp-attestation')).toBe('attestation-over-challenge-1');
    expect(signIn?.headers.get('x-cp-key-id')).toBe('key-1');
    expect(signIn?.headers.get('expo-origin')).toBe('critterpass-staging://');

    const [otp] = to('/phone-number/send-otp');
    expect(otp?.headers.get('x-cp-assertion')).toBe('assertion-over-challenge-2');
    expect(otp?.headers.get('x-cp-attestation')).toBeNull();
    expect(attestKeyAsync).toHaveBeenCalledTimes(1);
  });

  it('adds nothing and fetches no challenge for calls the api does not attest', async () => {
    const { client, to, fetchChallenge } = setup(ok);

    await client.phoneNumber.verify({ phoneNumber: '+84900000000', code: '123456' });
    await client.signOut();

    for (const request of [...to('/phone-number/verify'), ...to('/sign-out')]) {
      for (const name of ATTESTATION_HEADERS) expect(request.headers.get(name)).toBeNull();
    }
    expect(fetchChallenge).not.toHaveBeenCalled();
  });

  it('still signs in, flagged unavailable, where App Attest is not supported', async () => {
    const { client, to, fetchChallenge } = setup(ok, false);

    const { error } = await client.signIn.anonymous();

    expect(error).toBeNull();
    const [signIn] = to('/sign-in/anonymous');
    expect(signIn?.headers.get('x-cp-attestation-unavailable')).toBe('unsupported');
    expect(signIn?.headers.get('x-cp-install-id')).toBe(INSTALL_ID);
    expect(fetchChallenge).not.toHaveBeenCalled();
  });

  it('re-attests and resends once when the api no longer knows the key', async () => {
    const rejectAssertion = (path: string, headers: Headers): Reply =>
      path === '/phone-number/send-otp' && headers.get('x-cp-assertion') !== null
        ? { status: 403, body: { error: { code: 'ATTESTATION_FAILED', retryable: false } } }
        : ok();
    const { client, to, attestKeyAsync } = setup(rejectAssertion);

    await client.signIn.anonymous();
    const { error } = await client.phoneNumber.sendOtp({ phoneNumber: '+84900000000' });

    expect(error).toBeNull();
    const sends = to('/phone-number/send-otp');
    expect(sends).toHaveLength(2);
    expect(sends[0]?.headers.get('x-cp-assertion')).not.toBeNull();
    expect(sends[1]?.headers.get('x-cp-attestation')).toBe('attestation-over-challenge-3');
    expect(attestKeyAsync).toHaveBeenCalledTimes(2);
  });
});
