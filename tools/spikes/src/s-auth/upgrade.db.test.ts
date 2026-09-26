import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthHarness, type SpikeAuthHarness } from './harness';
import { call } from './http';
import { startMockIdp, type MockIdp } from './mock-idp';
import { serveAuthHarness, type RunningHarness } from './serve';

interface AnonymousSignIn {
  user: { id: string; isAnonymous: boolean };
}
interface PhoneVerifyResult {
  status: boolean;
  user: { id: string; isAnonymous: boolean; phoneNumber: string; phoneNumberVerified: boolean };
}
interface LinkSocialResult {
  status: boolean;
}
interface SessionResult {
  user: { id: string; isAnonymous: boolean };
}

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let mockIdp: MockIdp;
let authHarness: SpikeAuthHarness;
let harness: RunningHarness;

beforeAll(async () => {
  [postgres, mockIdp] = await Promise.all([startPostgres(), startMockIdp()]);
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  authHarness = await createAuthHarness(pool, mockIdp);
  harness = await serveAuthHarness(authHarness.auth);
});

afterAll(async () => {
  await harness.close();
  await mockIdp.close();
  await pool.end();
  await postgres.stop();
});

describe('anonymous upgrade keeps the uid (no conflicting identity)', () => {
  it('phone verify with updatePhoneNumber keeps the uid and clears isAnonymous', async () => {
    const anon = await call(harness.baseUrl, '/sign-in/anonymous');
    const anonUser = anon.json as AnonymousSignIn;
    expect(anonUser.user.isAnonymous).toBe(true);

    const phoneNumber = '+15550001111';
    await call(harness.baseUrl, '/phone-number/send-otp', {
      body: { phoneNumber },
      cookie: anon.cookie,
    });
    const code = authHarness.getOtp(phoneNumber);
    expect(code).toBeTruthy();

    const verified = await call(harness.baseUrl, '/phone-number/verify', {
      body: { phoneNumber, code, updatePhoneNumber: true },
      cookie: anon.cookie,
    });
    expect(verified.response.status).toBe(200);
    const result = verified.json as PhoneVerifyResult;
    expect(result.status).toBe(true);
    expect(result.user.id).toBe(anonUser.user.id);
    expect(result.user.phoneNumberVerified).toBe(true);

    // The verify response's `user` is built before `callbackOnVerification` runs, so it
    // still shows the pre-callback `isAnonymous`; a fresh session read sees the real value.
    const session = await call(harness.baseUrl, '/get-session', {
      method: 'GET',
      cookie: anon.cookie,
    });
    const sessionResult = session.json as SessionResult;
    expect(sessionResult.user.id).toBe(anonUser.user.id);
    expect(sessionResult.user.isAnonymous).toBe(false);
  });

  it('linkSocial with a fresh identity keeps the uid and clears isAnonymous', async () => {
    const anon = await call(harness.baseUrl, '/sign-in/anonymous');
    const anonUser = anon.json as AnonymousSignIn;

    const idToken = await mockIdp.mintIdToken({
      sub: 'fresh-user-1',
      email: 'fresh-user-1@spike.test',
    });
    const linked = await call(harness.baseUrl, '/link-social', {
      body: { provider: 'mock-idp', idToken: { token: idToken } },
      cookie: anon.cookie,
    });
    expect(linked.response.status).toBe(200);
    expect((linked.json as LinkSocialResult).status).toBe(true);

    const session = await call(harness.baseUrl, '/get-session', {
      method: 'GET',
      cookie: anon.cookie,
    });
    const sessionResult = session.json as SessionResult;
    expect(sessionResult.user.id).toBe(anonUser.user.id);
    expect(sessionResult.user.isAnonymous).toBe(false);
  });
});
