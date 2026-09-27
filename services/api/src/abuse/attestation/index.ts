/**
 * Attestation enforcement for `/sign-in/anonymous` and `/phone-number/send-otp` (docs/data-model.md
 * §3.1 F-029; phase-9 T3). The client carries attestation data in request headers (`X-CP-Install-Id`,
 * `X-CP-Platform`, plus either `X-CP-Attestation` + `X-CP-Key-Id` on the first attested call per
 * install, or `X-CP-Assertion` on every later sensitive call, and `X-CP-Challenge` naming the
 * single-use challenge from `POST /v1/attest/challenge` it just consumed) — neither Better Auth
 * endpoint declares a body schema attestation could otherwise ride along in.
 */
import type pg from 'pg';

import { withSystem } from '@cp/db';
import { DomainError } from '@cp/domain';

import {
  verifyAppAttestAssertion,
  verifyAppAttestAttestation,
  type AppAttestConfig,
} from './app-attest';
import { consumeChallenge, type ChallengeRedisClient } from './challenge';
import {
  verifyPlayIntegrity,
  type PlayIntegrityConfig,
  type PlayIntegrityHttpClient,
} from './play-integrity';

export type AttestationMode = 'enforce' | 'log';
export type AttestationPlatform = 'ios' | 'android';

export interface AndroidAttestationConfig {
  readonly playIntegrity: PlayIntegrityConfig;
  readonly http: PlayIntegrityHttpClient;
}

export interface AttestationConfig {
  readonly iosMode: AttestationMode;
  readonly androidMode: AttestationMode;
  readonly appAttest: AppAttestConfig;
  /** Absent when no Play Integrity credentials are provisioned yet (phase-9 §Non-code dependencies): Android attestation then always behaves as `log`, regardless of `androidMode`. */
  readonly android: AndroidAttestationConfig | undefined;
}

export interface AttestationDeps {
  readonly appPool: pg.Pool;
  readonly redis: ChallengeRedisClient;
  readonly config: AttestationConfig;
  /** Structured-logging seam (services/api/src/auth/index.ts wires the real logger); called only when `log` mode swallows a failure that `enforce` would have thrown. */
  readonly onAttestationFailure?:
    | ((
        error: unknown,
        context: { installId: string | undefined; platform: string | undefined },
      ) => void)
    | undefined;
}

export interface AttestationHeaders {
  readonly installId: string | undefined;
  readonly platform: AttestationPlatform | undefined;
  readonly attestationObjectBase64: string | undefined;
  readonly assertionBase64: string | undefined;
  readonly keyIdBase64: string | undefined;
  readonly challenge: string | undefined;
  readonly integrityToken: string | undefined;
}

function isPlatform(value: string | null): value is AttestationPlatform {
  return value === 'ios' || value === 'android';
}

export function extractAttestationHeaders(headers: Headers): AttestationHeaders {
  return {
    installId: headers.get('x-cp-install-id') ?? undefined,
    platform: isPlatform(headers.get('x-cp-platform'))
      ? (headers.get('x-cp-platform') as AttestationPlatform)
      : undefined,
    attestationObjectBase64: headers.get('x-cp-attestation') ?? undefined,
    assertionBase64: headers.get('x-cp-assertion') ?? undefined,
    keyIdBase64: headers.get('x-cp-key-id') ?? undefined,
    challenge: headers.get('x-cp-challenge') ?? undefined,
    integrityToken: headers.get('x-cp-integrity-token') ?? undefined,
  };
}

interface StoredAttestation {
  readonly publicKeyPem: string;
  readonly counter: number;
}

async function getStoredAttestation(
  pool: pg.Pool,
  installId: string,
): Promise<StoredAttestation | undefined> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ public_key: string; counter: number }>(
      'SELECT public_key, counter FROM device_attestations WHERE install_id = $1',
      [installId],
    ),
  );
  const row = rows[0];
  return row ? { publicKeyPem: row.public_key, counter: row.counter } : undefined;
}

async function storeAttestation(
  pool: pg.Pool,
  input: {
    installId: string;
    platform: AttestationPlatform;
    keyId: string;
    publicKeyPem: string;
    verdict: string;
  },
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (install_id) DO UPDATE SET
         key_id = EXCLUDED.key_id,
         public_key = EXCLUDED.public_key,
         verdict = EXCLUDED.verdict,
         attested_at = now()`,
      [input.installId, input.platform, input.keyId, input.publicKeyPem, input.verdict],
    ),
  );
}

async function recordAssertion(pool: pg.Pool, installId: string, counter: number): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      'UPDATE device_attestations SET counter = $2, last_assertion_at = now() WHERE install_id = $1',
      [installId, counter],
    ),
  );
}

async function verifyIosAttestation(
  headers: AttestationHeaders,
  deps: AttestationDeps,
  appAttestConfig: AppAttestConfig,
): Promise<void> {
  if (!headers.installId || !headers.challenge) {
    throw new DomainError('ATTESTATION_FAILED', {
      platform: 'ios',
      reason: 'missing install id or challenge',
    });
  }
  const challengeOk = await consumeChallenge(deps.redis, headers.installId, headers.challenge);
  if (!challengeOk) {
    throw new DomainError('ATTESTATION_FAILED', {
      platform: 'ios',
      reason: 'challenge invalid, expired or reused',
    });
  }
  const challengeBuffer = Buffer.from(headers.challenge, 'base64url');

  if (headers.attestationObjectBase64) {
    if (!headers.keyIdBase64) {
      throw new DomainError('ATTESTATION_FAILED', { platform: 'ios', reason: 'missing key id' });
    }
    const result = verifyAppAttestAttestation({
      attestationObject: Buffer.from(headers.attestationObjectBase64, 'base64'),
      challenge: challengeBuffer,
      keyId: headers.keyIdBase64,
      config: appAttestConfig,
    });
    await storeAttestation(deps.appPool, {
      installId: headers.installId,
      platform: 'ios',
      keyId: result.keyId,
      publicKeyPem: result.publicKeyPem,
      verdict: result.environment,
    });
    return;
  }

  if (headers.assertionBase64) {
    const stored = await getStoredAttestation(deps.appPool, headers.installId);
    if (!stored) {
      throw new DomainError('ATTESTATION_FAILED', {
        platform: 'ios',
        reason: 'no prior attestation for this install',
      });
    }
    const result = verifyAppAttestAssertion({
      assertion: Buffer.from(headers.assertionBase64, 'base64'),
      payload: challengeBuffer,
      publicKeyPem: stored.publicKeyPem,
      previousCounter: stored.counter,
      config: appAttestConfig,
    });
    await recordAssertion(deps.appPool, headers.installId, result.counter);
    return;
  }

  throw new DomainError('ATTESTATION_FAILED', {
    platform: 'ios',
    reason: 'no attestation or assertion provided',
  });
}

async function verifyAndroidAttestation(
  headers: AttestationHeaders,
  deps: AttestationDeps,
  android: AndroidAttestationConfig,
): Promise<void> {
  if (!headers.installId || !headers.challenge || !headers.integrityToken) {
    throw new DomainError('ATTESTATION_FAILED', {
      platform: 'android',
      reason: 'missing install id, challenge or integrity token',
    });
  }
  const challengeOk = await consumeChallenge(deps.redis, headers.installId, headers.challenge);
  if (!challengeOk) {
    throw new DomainError('ATTESTATION_FAILED', {
      platform: 'android',
      reason: 'challenge invalid, expired or reused',
    });
  }
  const result = await verifyPlayIntegrity({
    integrityToken: headers.integrityToken,
    expectedNonce: headers.challenge,
    config: android.playIntegrity,
    http: android.http,
  });
  await storeAttestation(deps.appPool, {
    installId: headers.installId,
    platform: 'android',
    // Play Integrity has no persistent client keypair the way App Attest does; the install id
    // itself is the natural row key, so key_id is set to it for schema-shape parity.
    keyId: headers.installId,
    publicKeyPem: '',
    verdict: result.deviceRecognitionVerdict.join(','),
  });
}

/**
 * The single entry point `services/api/src/auth/hooks.ts`'s `hooks.before` calls. Mode is decided
 * entirely by `deps.config` (never by request input, per F-029): `log` mode still runs full
 * verification (so failures are observable via `onAttestationFailure`) but never blocks the request.
 */
export async function enforceAttestation(
  requestHeaders: Headers,
  deps: AttestationDeps,
): Promise<void> {
  const headers = extractAttestationHeaders(requestHeaders);
  const platform = headers.platform;
  const android = deps.config.android;

  // A missing/unrecognised platform header is itself a failure, but still mode-gated below: an
  // ancient or misbehaving client must not be able to bypass `log` mode any more than a client that
  // sent a real, failing attestation could.
  const mode =
    platform === 'ios'
      ? deps.config.iosMode
      : platform === 'android' && android
        ? deps.config.androidMode
        : deps.config.iosMode === 'enforce' || deps.config.androidMode === 'enforce'
          ? 'enforce'
          : 'log';

  try {
    if (!platform) {
      throw new DomainError('ATTESTATION_FAILED', {
        reason: 'missing or unrecognised platform header',
      });
    }
    if (platform === 'ios') {
      await verifyIosAttestation(headers, deps, deps.config.appAttest);
    } else if (android) {
      await verifyAndroidAttestation(headers, deps, android);
    }
    // else: android with no Play Integrity credentials provisioned (phase-9 §Non-code
    // dependencies) — nothing to verify against; `mode` is already forced to `log` above.
  } catch (error) {
    if (mode === 'enforce') throw error;
    deps.onAttestationFailure?.(error, { installId: headers.installId, platform });
  }
}

export type { AppAttestConfig } from './app-attest';
export type { PlayIntegrityConfig, PlayIntegrityHttpClient } from './play-integrity';
export { createGooglePlayIntegrityHttpClient } from './play-integrity';
export { issueChallenge, type ChallengeRedisClient } from './challenge';
