import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthHarness, type SpikeAuthHarness } from './harness';
import { call } from './http';
import { startMockIdp, type MockIdp } from './mock-idp';
import {
  countAuditRows,
  countOwnedBy,
  createOwnedRow,
  ensureOwnedRowsSchema,
  mergeOwnedRows,
} from './owned-rows';
import { serveAuthHarness, type RunningHarness } from './serve';

interface SignInResult {
  user: { id: string };
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
  await ensureOwnedRowsSchema(pool);
});

afterAll(async () => {
  await harness.close();
  await mockIdp.close();
  await pool.end();
  await postgres.stop();
});

async function userExists(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('select 1 from "user" where id = $1', [userId]);
  return (rowCount ?? 0) > 0;
}

describe('signing in from an anonymous session with an identity owned elsewhere merges', () => {
  it('resolves to the existing user, moves owned rows in one tx, and drops the anonymous user', async () => {
    const idToken = await mockIdp.mintIdToken({
      sub: 'shared-user-1',
      email: 'shared-user-1@spike.test',
    });

    // An ordinary sign-up: nobody was anonymous, so this identity is simply claimed by a new user.
    const signUp = await call(harness.baseUrl, '/sign-in/social', {
      body: { provider: 'mock-idp', idToken: { token: idToken } },
    });
    expect(signUp.response.status).toBe(200);
    const existingUserId = (signUp.json as SignInResult).user.id;

    const anon = await call(harness.baseUrl, '/sign-in/anonymous');
    const anonUserId = (anon.json as SignInResult).user.id;
    await createOwnedRow(pool, anonUserId, 'trip-draft');
    expect(await countOwnedBy(pool, anonUserId)).toBe(1);

    // Same identity, now from the anonymous session: Better Auth resolves this to the
    // existing user (a "merge ticket"), which is what fires the anonymous plugin's
    // onLinkAccount hook wired to mergeOwnedRows in tools/spikes/src/s-auth/harness.ts.
    const mergeSignIn = await call(harness.baseUrl, '/sign-in/social', {
      body: { provider: 'mock-idp', idToken: { token: idToken } },
      cookie: anon.cookie,
    });
    expect(mergeSignIn.response.status).toBe(200);
    expect((mergeSignIn.json as SignInResult).user.id).toBe(existingUserId);

    expect(await countOwnedBy(pool, existingUserId)).toBe(1);
    expect(await countOwnedBy(pool, anonUserId)).toBe(0);
    expect(await userExists(anonUserId)).toBe(false);
    expect(await userExists(existingUserId)).toBe(true);
  });
});

describe('mergeOwnedRows atomicity', () => {
  it('rolls back the ownership change when the transaction fails partway through', async () => {
    await createOwnedRow(pool, 'atomic-user-a', 'packing-list');

    await expect(
      mergeOwnedRows(pool, {
        fromUserId: 'atomic-user-a',
        toUserId: 'atomic-user-b',
        injectFailureAfterUpdate: true,
      }),
    ).rejects.toThrow('injected failure');

    expect(await countOwnedBy(pool, 'atomic-user-a')).toBe(1);
    expect(await countOwnedBy(pool, 'atomic-user-b')).toBe(0);
    expect(await countAuditRows(pool, 'atomic-user-a')).toBe(0);

    // Positive control: the same rows merge cleanly once nothing forces a failure, proving
    // the rollback above was caused by the injected fault and not a bug in the update itself.
    await mergeOwnedRows(pool, { fromUserId: 'atomic-user-a', toUserId: 'atomic-user-b' });
    expect(await countOwnedBy(pool, 'atomic-user-a')).toBe(0);
    expect(await countOwnedBy(pool, 'atomic-user-b')).toBe(1);
    expect(await countAuditRows(pool, 'atomic-user-a')).toBe(1);
  });
});
