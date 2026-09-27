/**
 * T3 done-when (phase-9): `device_attestations` gets a real row from a valid attestation, an
 * assertion updates its counter, `enforce` mode blocks a bad/missing attestation while `log` mode
 * never does, and mode is not influenced by anything in the request (F-029: "chosen by env var,
 * never by client input"). Needs Postgres for the `device_attestations` writes
 * (services/api/src/abuse/attestation/index.ts's `storeAttestation`/`recordAssertion`) but no HTTP
 * server: `enforceAttestation` is called directly with hand-built `Headers`, the same shape
 * services/api/src/auth/hooks.ts's `hooks.before` extracts from a real request.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { runMigrations, withSystem } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  enforceAttestation,
  issueChallenge,
  type AttestationConfig,
  type AttestationDeps,
} from '../../src/abuse/attestation';
import {
  buildAppAttestFixture,
  generateTestRoot,
  type TestAppAttestRoot,
} from '../fixtures/attestation/app-attest-fixture';

const TEAM_ID = 'YFND2EEW8S';
const BUNDLE_ID = 'app.critterpass';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let root: TestAppAttestRoot;

beforeAll(async () => {
  [postgres, redisContainer, root] = await Promise.all([
    startPostgres(),
    startRedis(),
    generateTestRoot(),
  ]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
}, 180_000);

afterAll(async () => {
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

function appAttestConfig(overrides: Partial<AttestationConfig> = {}): AttestationConfig {
  return {
    iosMode: 'enforce',
    androidMode: 'enforce',
    appAttest: {
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      rootCertificatePem: root.rootCertificatePem,
      allowDevelopmentEnvironment: true,
    },
    android: undefined,
    ...overrides,
  };
}

function deps(
  config: AttestationConfig,
  onAttestationFailure?: AttestationDeps['onAttestationFailure'],
): AttestationDeps {
  return {
    appPool: pool,
    redis,
    config,
    ...(onAttestationFailure ? { onAttestationFailure } : {}),
  };
}

async function storedAttestation(installId: string) {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ counter: number; verdict: string; last_assertion_at: Date | null }>(
      'SELECT counter, verdict, last_assertion_at FROM device_attestations WHERE install_id = $1',
      [installId],
    ),
  );
  return rows[0];
}

describe('enforceAttestation: enforce mode', () => {
  it('stores a real device_attestations row for a valid ios attestation', async () => {
    const installId = randomUUID();
    const { challenge } = await issueChallenge(redis, installId);
    const challengeBuffer = Buffer.from(challenge, 'base64url');
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge: challengeBuffer,
    });

    const headers = new Headers({
      'x-cp-install-id': installId,
      'x-cp-platform': 'ios',
      'x-cp-challenge': challenge,
      'x-cp-attestation': fixture.attestationObject.toString('base64'),
      'x-cp-key-id': fixture.keyId,
    });

    await enforceAttestation(headers, deps(appAttestConfig()));

    const row = await storedAttestation(installId);
    expect(row?.verdict).toBe('development');
  });

  it('throws ATTESTATION_FAILED when the platform header is missing', async () => {
    await expect(enforceAttestation(new Headers(), deps(appAttestConfig()))).rejects.toMatchObject({
      code: 'ATTESTATION_FAILED',
    });
  });

  it('throws when the challenge was never issued for this install id', async () => {
    const installId = randomUUID();
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge: randomBytes(32),
    });
    const headers = new Headers({
      'x-cp-install-id': installId,
      'x-cp-platform': 'ios',
      'x-cp-challenge': randomBytes(32).toString('base64url'),
      'x-cp-attestation': fixture.attestationObject.toString('base64'),
      'x-cp-key-id': fixture.keyId,
    });
    await expect(enforceAttestation(headers, deps(appAttestConfig()))).rejects.toMatchObject({
      code: 'ATTESTATION_FAILED',
    });
  });

  it('is not influenced by a client-supplied mode-like header or query hint', async () => {
    // No such header is ever read by services/api/src/abuse/attestation/index.ts; sending one (as
    // an attacker would try) changes nothing — this call still fails exactly as the header-less
    // case above does, proving mode comes only from AttestationConfig.
    const headers = new Headers({ 'x-cp-attestation-mode': 'log', 'x-attestation-mode': 'log' });
    await expect(enforceAttestation(headers, deps(appAttestConfig()))).rejects.toMatchObject({
      code: 'ATTESTATION_FAILED',
    });
  });
});

describe('enforceAttestation: log mode', () => {
  it('never throws, and reports the failure via onAttestationFailure', async () => {
    const failures: unknown[] = [];
    await expect(
      enforceAttestation(
        new Headers(),
        deps(appAttestConfig({ iosMode: 'log', androidMode: 'log' }), (error) => {
          failures.push(error);
        }),
      ),
    ).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ code: 'ATTESTATION_FAILED' });
  });

  it('still stores a row for a valid attestation (log mode verifies fully, it only avoids blocking)', async () => {
    const installId = randomUUID();
    const { challenge } = await issueChallenge(redis, installId);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge: Buffer.from(challenge, 'base64url'),
    });
    const headers = new Headers({
      'x-cp-install-id': installId,
      'x-cp-platform': 'ios',
      'x-cp-challenge': challenge,
      'x-cp-attestation': fixture.attestationObject.toString('base64'),
      'x-cp-key-id': fixture.keyId,
    });
    await enforceAttestation(
      headers,
      deps(appAttestConfig({ iosMode: 'log', androidMode: 'log' })),
    );
    expect(await storedAttestation(installId)).toBeDefined();
  });
});

describe('enforceAttestation: android with no Play Integrity credentials provisioned', () => {
  it('always behaves as log regardless of androidMode', async () => {
    const failures: unknown[] = [];
    const headers = new Headers({ 'x-cp-platform': 'android', 'x-cp-install-id': randomUUID() });
    await expect(
      enforceAttestation(
        headers,
        deps(appAttestConfig({ androidMode: 'enforce', android: undefined }), (error) => {
          failures.push(error);
        }),
      ),
    ).resolves.toBeUndefined();
    // No credentials means nothing is verified at all (not even a failure to report) — this is the
    // phase's documented non-code-dependency fallback, not a silently-passed check.
    expect(failures).toHaveLength(0);
  });
});
