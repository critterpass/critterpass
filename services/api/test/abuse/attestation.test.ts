/**
 * Valid fixtures pass; tampered nonce/app id/reused challenge/replayed counter fail with
 * `ATTESTATION_FAILED`. Pure unit coverage for
 * services/api/src/abuse/attestation/{app-attest,play-integrity,challenge}.ts — no Postgres; the
 * `device_attestations` row lifecycle and the `enforce`/`log` mode gate are
 * test/abuse/attestation.db.test.ts.
 */
import { randomBytes } from 'node:crypto';

import { DomainError } from '@cp/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  verifyAppAttestAssertion,
  verifyAppAttestAttestation,
  type AppAttestConfig,
} from '../../src/abuse/attestation/app-attest';
import {
  consumeChallenge,
  issueChallenge,
  type ChallengeRedisClient,
} from '../../src/abuse/attestation/challenge';
import {
  verifyPlayIntegrity,
  type PlayIntegrityDecodedPayload,
  type PlayIntegrityHttpClient,
} from '../../src/abuse/attestation/play-integrity';
import {
  buildAppAttestAssertionFixture,
  buildAppAttestFixture,
  generateTestRoot,
  type TestAppAttestRoot,
} from '../fixtures/attestation/app-attest-fixture';

const TEAM_ID = 'YFND2EEW8S';
const BUNDLE_ID = 'app.critterpass';

let root: TestAppAttestRoot;

beforeAll(async () => {
  root = await generateTestRoot();
}, 30_000);

function config(overrides: Partial<AppAttestConfig> = {}): AppAttestConfig {
  return {
    teamId: TEAM_ID,
    bundleId: BUNDLE_ID,
    rootCertificatePem: root.rootCertificatePem,
    allowDevelopmentEnvironment: true,
    ...overrides,
  };
}

function expectAttestationFailed(fn: () => unknown): void {
  expect(fn).toThrow(DomainError);
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ATTESTATION_FAILED');
  }
}

describe('verifyAppAttestAttestation', () => {
  it('accepts a valid fixture and returns the derived keyId/publicKey/environment', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    const result = verifyAppAttestAttestation({
      attestationObject: fixture.attestationObject,
      challenge,
      keyId: fixture.keyId,
      config: config(),
    });
    expect(result.keyId).toBe(fixture.keyId);
    expect(result.environment).toBe('development');
    expect(result.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('rejects a tampered nonce', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
      tamperNonce: true,
    });
    expectAttestationFailed(() =>
      verifyAppAttestAttestation({
        attestationObject: fixture.attestationObject,
        challenge,
        keyId: fixture.keyId,
        config: config(),
      }),
    );
  });

  it('rejects a mismatched app id (wrong bundle id signed into authData)', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
      bundleIdOverride: 'app.critterpass.imposter',
    });
    expectAttestationFailed(() =>
      verifyAppAttestAttestation({
        attestationObject: fixture.attestationObject,
        challenge,
        keyId: fixture.keyId,
        config: config(),
      }),
    );
  });

  it('rejects a chain that does not lead to the configured trusted root', async () => {
    const otherRoot = await generateTestRoot();
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root: otherRoot,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    expectAttestationFailed(() =>
      verifyAppAttestAttestation({
        attestationObject: fixture.attestationObject,
        challenge,
        // Verifying against the *original* root's config, not otherRoot's.
        keyId: fixture.keyId,
        config: config(),
      }),
    );
  });

  it('rejects the development aaguid when allowDevelopmentEnvironment is false', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    expectAttestationFailed(() =>
      verifyAppAttestAttestation({
        attestationObject: fixture.attestationObject,
        challenge,
        keyId: fixture.keyId,
        config: config({ allowDevelopmentEnvironment: false }),
      }),
    );
  });

  it('accepts a production-environment fixture regardless of allowDevelopmentEnvironment', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
      environment: 'production',
    });
    const result = verifyAppAttestAttestation({
      attestationObject: fixture.attestationObject,
      challenge,
      keyId: fixture.keyId,
      config: config({ allowDevelopmentEnvironment: false }),
    });
    expect(result.environment).toBe('production');
  });

  it('rejects a keyId that does not match the certificate public key', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    expectAttestationFailed(() =>
      verifyAppAttestAttestation({
        attestationObject: fixture.attestationObject,
        challenge,
        keyId: 'not-the-real-key-id',
        config: config(),
      }),
    );
  });
});

describe('verifyAppAttestAssertion', () => {
  it('accepts a valid assertion and reports the new counter', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    const attested = verifyAppAttestAttestation({
      attestationObject: fixture.attestationObject,
      challenge,
      keyId: fixture.keyId,
      config: config(),
    });

    const assertionPayload = randomBytes(32);
    const assertion = await buildAppAttestAssertionFixture({
      deviceKeys: fixture.deviceKeys,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      payload: assertionPayload,
      counter: 1,
    });
    const result = verifyAppAttestAssertion({
      assertion,
      payload: assertionPayload,
      publicKeyPem: attested.publicKeyPem,
      previousCounter: 0,
      config: { teamId: TEAM_ID, bundleId: BUNDLE_ID },
    });
    expect(result.counter).toBe(1);
  });

  it('rejects a replayed assertion (counter not greater than the stored one)', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    const attested = verifyAppAttestAttestation({
      attestationObject: fixture.attestationObject,
      challenge,
      keyId: fixture.keyId,
      config: config(),
    });
    const payload = randomBytes(32);
    const assertion = await buildAppAttestAssertionFixture({
      deviceKeys: fixture.deviceKeys,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      payload,
      counter: 1,
    });

    expectAttestationFailed(() =>
      verifyAppAttestAssertion({
        assertion,
        payload,
        publicKeyPem: attested.publicKeyPem,
        // Already at counter 1: replaying the same counter=1 assertion must be rejected.
        previousCounter: 1,
        config: { teamId: TEAM_ID, bundleId: BUNDLE_ID },
      }),
    );
  });

  it('rejects a signature from the wrong device key', async () => {
    const challenge = randomBytes(32);
    const fixture = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge,
    });
    const attested = verifyAppAttestAttestation({
      attestationObject: fixture.attestationObject,
      challenge,
      keyId: fixture.keyId,
      config: config(),
    });
    const impostor = await buildAppAttestFixture({
      root,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      challenge: randomBytes(32),
    });
    const payload = randomBytes(32);
    const assertion = await buildAppAttestAssertionFixture({
      deviceKeys: impostor.deviceKeys,
      teamId: TEAM_ID,
      bundleId: BUNDLE_ID,
      payload,
      counter: 1,
    });

    expectAttestationFailed(() =>
      verifyAppAttestAssertion({
        assertion,
        payload,
        publicKeyPem: attested.publicKeyPem,
        previousCounter: 0,
        config: { teamId: TEAM_ID, bundleId: BUNDLE_ID },
      }),
    );
  });
});

class FakeChallengeRedis implements ChallengeRedisClient {
  private readonly store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    await Promise.resolve();
  }

  async getDel(key: string): Promise<string | null> {
    const value = this.store.get(key) ?? null;
    this.store.delete(key);
    await Promise.resolve();
    return value;
  }
}

describe('attestation challenge: single-use', () => {
  it('consumes the exact challenge issued for an install id', async () => {
    const redis = new FakeChallengeRedis();
    const { challenge } = await issueChallenge(redis, 'install-1');
    expect(await consumeChallenge(redis, 'install-1', challenge)).toBe(true);
  });

  it('rejects a second attempt to consume the same challenge (replay)', async () => {
    const redis = new FakeChallengeRedis();
    const { challenge } = await issueChallenge(redis, 'install-2');
    expect(await consumeChallenge(redis, 'install-2', challenge)).toBe(true);
    expect(await consumeChallenge(redis, 'install-2', challenge)).toBe(false);
  });

  it('rejects a challenge for an install id that never had one issued', async () => {
    const redis = new FakeChallengeRedis();
    expect(await consumeChallenge(redis, 'never-issued', 'anything')).toBe(false);
  });

  it('rejects a wrong (but present) challenge value', async () => {
    const redis = new FakeChallengeRedis();
    await issueChallenge(redis, 'install-3');
    expect(await consumeChallenge(redis, 'install-3', 'wrong-value')).toBe(false);
  });
});

describe('verifyPlayIntegrity', () => {
  const PACKAGE_NAME = 'app.critterpass';
  const CERT_DIGEST = 'AA:BB:CC'.replaceAll(':', '');

  function fakeHttp(payload: PlayIntegrityDecodedPayload): PlayIntegrityHttpClient {
    return { decodeIntegrityToken: () => Promise.resolve(payload) };
  }

  function validPayload(nonce: string): PlayIntegrityDecodedPayload {
    return {
      requestDetails: { requestPackageName: PACKAGE_NAME, nonce },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
        packageName: PACKAGE_NAME,
        certificateSha256Digest: [CERT_DIGEST],
      },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    };
  }

  it('accepts a fully valid decoded payload', async () => {
    const result = await verifyPlayIntegrity({
      integrityToken: 'token',
      expectedNonce: 'nonce-1',
      config: { packageName: PACKAGE_NAME, certificateSha256Digests: [CERT_DIGEST] },
      http: fakeHttp(validPayload('nonce-1')),
    });
    expect(result.deviceRecognitionVerdict).toEqual(['MEETS_DEVICE_INTEGRITY']);
  });

  it('rejects a mismatched nonce', async () => {
    await expect(
      verifyPlayIntegrity({
        integrityToken: 'token',
        expectedNonce: 'expected',
        config: { packageName: PACKAGE_NAME, certificateSha256Digests: [CERT_DIGEST] },
        http: fakeHttp(validPayload('different')),
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_FAILED' });
  });

  it('rejects an unrecognised signing certificate digest', async () => {
    await expect(
      verifyPlayIntegrity({
        integrityToken: 'token',
        expectedNonce: 'nonce-1',
        config: { packageName: PACKAGE_NAME, certificateSha256Digests: ['SOMETHING-ELSE'] },
        http: fakeHttp(validPayload('nonce-1')),
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_FAILED' });
  });

  it('rejects a device integrity verdict below MEETS_DEVICE_INTEGRITY', async () => {
    const payload = validPayload('nonce-1');
    await expect(
      verifyPlayIntegrity({
        integrityToken: 'token',
        expectedNonce: 'nonce-1',
        config: { packageName: PACKAGE_NAME, certificateSha256Digests: [CERT_DIGEST] },
        http: fakeHttp({
          ...payload,
          deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY'] },
        }),
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_FAILED' });
  });
});
