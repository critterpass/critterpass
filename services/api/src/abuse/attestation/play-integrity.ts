/**
 * Android Play Integrity verification (docs/developer.android.com/google/play/integrity/verdicts).
 * The HTTP call to Google's `decodeIntegrityToken` is injectable so tests use
 * recorded-shape fixtures instead of a real service account (code-standards.md §17: test doubles
 * only at the network boundary) — everything after the response is decoded (verdict/package/nonce
 * checks) is the same real code for both.
 */
import { DomainError } from '@cp/domain';
import { importPKCS8, SignJWT } from 'jose';

export interface PlayIntegrityConfig {
  readonly packageName: string;
  /** SHA-256 digest(s) of the app's signing certificate(s), as Google reports them (uppercase hex, colon-free). */
  readonly certificateSha256Digests: readonly string[];
}

export interface PlayIntegrityDecodedPayload {
  readonly requestDetails?: {
    readonly requestPackageName?: string;
    readonly nonce?: string;
    readonly timestampMillis?: string;
  };
  readonly appIntegrity?: {
    readonly appRecognitionVerdict?: string;
    readonly packageName?: string;
    readonly certificateSha256Digest?: readonly string[];
  };
  readonly deviceIntegrity?: {
    readonly deviceRecognitionVerdict?: readonly string[];
  };
}

/** Injected so the real implementation (service-account JWT-bearer OAuth2 + the Play Integrity REST call) never has to live behind a fake in tests. */
export interface PlayIntegrityHttpClient {
  decodeIntegrityToken(
    integrityToken: string,
    packageName: string,
  ): Promise<PlayIntegrityDecodedPayload>;
}

export interface PlayIntegrityVerifyInput {
  readonly integrityToken: string;
  readonly expectedNonce: string;
  readonly config: PlayIntegrityConfig;
  readonly http: PlayIntegrityHttpClient;
}

export interface PlayIntegrityVerifyResult {
  readonly deviceRecognitionVerdict: readonly string[];
}

const ACCEPTED_DEVICE_VERDICTS = ['MEETS_DEVICE_INTEGRITY'];

function fail(reason: string): never {
  throw new DomainError('ATTESTATION_FAILED', { platform: 'android', reason });
}

export async function verifyPlayIntegrity(
  input: PlayIntegrityVerifyInput,
): Promise<PlayIntegrityVerifyResult> {
  const payload = await input.http.decodeIntegrityToken(
    input.integrityToken,
    input.config.packageName,
  );

  if (payload.requestDetails?.nonce !== input.expectedNonce) {
    return fail('nonce does not match the issued challenge');
  }
  if (payload.requestDetails?.requestPackageName !== input.config.packageName) {
    return fail('request package name does not match');
  }
  if (payload.appIntegrity?.packageName !== input.config.packageName) {
    return fail('app package name does not match');
  }
  if (payload.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    return fail(
      `app recognition verdict was ${String(payload.appIntegrity?.appRecognitionVerdict)}`,
    );
  }
  const digests = payload.appIntegrity?.certificateSha256Digest ?? [];
  if (!digests.some((digest) => input.config.certificateSha256Digests.includes(digest))) {
    return fail('signing certificate digest does not match');
  }

  const deviceVerdict = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (!deviceVerdict.some((verdict) => ACCEPTED_DEVICE_VERDICTS.includes(verdict))) {
    return fail(`device integrity verdict was [${deviceVerdict.join(', ')}]`);
  }

  return { deviceRecognitionVerdict: deviceVerdict };
}

/**
 * The real `PlayIntegrityHttpClient`: exchanges a service-account key for an OAuth2 access token
 * (JWT-bearer grant, `https://www.googleapis.com/auth/playintegrity` scope, RFC 7523) then calls
 * `POST /v1/{packageName}:decodeIntegrityToken`. This is the only concrete implementation of the
 * port above; tests inject a fake `PlayIntegrityHttpClient` instead of exercising this function.
 */
export interface GoogleServiceAccountCredentials {
  readonly clientEmail: string;
  readonly privateKeyPem: string;
  readonly tokenUri: string;
}

const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const PLAY_INTEGRITY_API_BASE_URL = 'https://playintegrity.googleapis.com/v1';
const ASSERTION_LIFETIME_SECONDS = 3600;

async function signServiceAccountAssertion(
  credentials: GoogleServiceAccountCredentials,
): Promise<string> {
  const privateKey = await importPKCS8(credentials.privateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: PLAY_INTEGRITY_SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(credentials.clientEmail)
    .setAudience(credentials.tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + ASSERTION_LIFETIME_SECONDS)
    .sign(privateKey);
}

export function createGooglePlayIntegrityHttpClient(
  credentials: GoogleServiceAccountCredentials,
): PlayIntegrityHttpClient {
  return {
    async decodeIntegrityToken(integrityToken, packageName) {
      const assertion = await signServiceAccountAssertion(credentials);
      const tokenResponse = await fetch(credentials.tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      });
      if (!tokenResponse.ok) {
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          provider: 'google-oauth2',
          status: tokenResponse.status,
        });
      }
      const { access_token: accessToken } = (await tokenResponse.json()) as {
        access_token: string;
      };

      const decodeResponse = await fetch(
        `${PLAY_INTEGRITY_API_BASE_URL}/${packageName}:decodeIntegrityToken`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ integrityToken }),
        },
      );
      if (!decodeResponse.ok) {
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          provider: 'play-integrity',
          status: decodeResponse.status,
        });
      }
      const body = (await decodeResponse.json()) as {
        tokenPayloadExternal: PlayIntegrityDecodedPayload;
      };
      return body.tokenPayloadExternal;
    },
  };
}
