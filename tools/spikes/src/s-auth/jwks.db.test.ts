import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthHarness, type SpikeAuthHarness } from './harness';
import { call } from './http';
import { startMockIdp, type MockIdp } from './mock-idp';
import { serveAuthHarness, type RunningHarness } from './serve';

interface TokenResult {
  token: string;
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
  // Only this suite needs rotation to actually happen inside a single test run.
  authHarness = await createAuthHarness(pool, mockIdp, { jwksRotationIntervalSeconds: 2 });
  harness = await serveAuthHarness(authHarness.auth);
});

afterAll(async () => {
  await harness.close();
  await mockIdp.close();
  await pool.end();
  await postgres.stop();
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('JWKS: verified over the network the way PowerSync/Centrifugo do', () => {
  it('rotates the signing key while old tokens keep verifying inside the grace period', async () => {
    const anon = await call(harness.baseUrl, '/sign-in/anonymous');
    const userId = (anon.json as { user: { id: string } }).user.id;

    const first = await call(harness.baseUrl, '/token', { method: 'GET', cookie: anon.cookie });
    expect(first.response.status).toBe(200);
    const tokenA = (first.json as TokenResult).token;

    // cooldownDuration: 0 — jose defaults to a 30s cooldown between refetches so a client
    // hammering a stale kid can't hammer the JWKS endpoint either; this test rotates faster
    // than that on purpose; production rotates every quarter (system-architecture.md §6),
    // far outside any refetch cooldown.
    const jwks = createRemoteJWKSet(new URL(`${harness.baseUrl}/jwks`), { cooldownDuration: 0 });
    const verifiedA = await jwtVerify(tokenA, jwks, { audience: 'rt' });
    expect(verifiedA.payload.sub).toBe(userId);
    const kidA = verifiedA.protectedHeader.kid;

    // jwks.rotationInterval is 2s (tools/spikes/src/s-auth/harness.ts): once this key is
    // past that age, the next signing request mints a new one instead of reusing it.
    await sleep(2_500);

    const second = await call(harness.baseUrl, '/token', { method: 'GET', cookie: anon.cookie });
    const tokenB = (second.json as TokenResult).token;
    const verifiedB = await jwtVerify(tokenB, jwks, { audience: 'rt' });
    const kidB = verifiedB.protectedHeader.kid;
    expect(kidB).not.toBe(kidA);

    // The old key is still inside its 1h gracePeriod (harness.ts), so a token signed before
    // rotation must still verify against the current JWKS response.
    const stillValidA = await jwtVerify(tokenA, jwks, { audience: 'rt' });
    expect(stillValidA.payload.sub).toBe(userId);
  });
});
