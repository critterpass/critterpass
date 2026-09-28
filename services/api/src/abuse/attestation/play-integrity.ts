/**
 * Android Play Integrity verification (developer.android.com/google/play/integrity/verdicts).
 * The HTTP calls to Google's token endpoint and `decodeIntegrityToken` go through an injectable
 * `fetch`, so tests replay recorded-shape responses (code-standards.md §17: test doubles only at
 * the network boundary); everything after the response is decoded is the same real code.
 */
import { DomainError } from '@cp/domain';
import { importPKCS8, SignJWT } from 'jose';

export interface PlayIntegrityConfig {
  readonly packageName: string;
  /** SHA-256 digest(s) of the app's signing certificate(s), as Google reports them (URL-safe base64, no padding; see `normalizeCertificateDigest`). */
  readonly certificateSha256Digests: readonly string[];
}

export interface PlayIntegrityDecodedPayload {
  readonly requestDetails?: {
    readonly requestPackageName?: string;
    /** Standard requests bind the caller's request hash (the app passes the issued challenge). */
    readonly requestHash?: string;
    /** Classic requests bind a nonce instead. */
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

/**
 * Play Integrity reports certificate digests as URL-safe base64 without padding, while Play Console
 * shows the app signing key's SHA-256 as colon-separated hex. Accepts either and returns Google's
 * form, so the env value can be pasted straight from Play Console.
 */
export function normalizeCertificateDigest(value: string): string {
  const trimmed = value.trim();
  const hex = trimmed.replaceAll(':', '');
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex').toString('base64url');
  return trimmed.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

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

  const bound = payload.requestDetails?.requestHash ?? payload.requestDetails?.nonce;
  if (bound !== input.expectedNonce) {
    return fail('request hash does not match the issued challenge');
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
  const accepted = input.config.certificateSha256Digests.map(normalizeCertificateDigest);
  if (!digests.some((digest) => accepted.includes(normalizeCertificateDigest(digest)))) {
    // Certificate digests are public; logging the reported one lets `log` mode reveal the value
    // PLAY_INTEGRITY_CERT_SHA256_DIGESTS needs.
    return fail(`signing certificate digest [${digests.join(', ')}] is not an accepted one`);
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
 * `POST /v1/{packageName}:decodeIntegrityToken`. `fetchImpl` is the network seam tests replace
 * with recorded-shape responses.
 */
export interface GoogleServiceAccountCredentials {
  readonly clientEmail: string;
  readonly privateKeyPem: string;
  readonly tokenUri: string;
}

const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const PLAY_INTEGRITY_API_BASE_URL = 'https://playintegrity.googleapis.com/v1';
const ASSERTION_LIFETIME_SECONDS = 3600;
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Reads the fields the JWT-bearer grant needs from a downloaded service-account key file. */
export function parseGoogleServiceAccount(json: string): GoogleServiceAccountCredentials {
  let key: unknown;
  try {
    key = JSON.parse(json);
  } catch {
    throw new Error('service account key is not valid JSON');
  }
  const {
    client_email: clientEmail,
    private_key: privateKeyPem,
    token_uri: tokenUri,
  } = (key ?? {}) as Record<string, unknown>;
  if (typeof clientEmail !== 'string' || typeof privateKeyPem !== 'string') {
    throw new Error('service account key has no client_email or private_key');
  }
  return {
    clientEmail,
    privateKeyPem,
    tokenUri: typeof tokenUri === 'string' ? tokenUri : DEFAULT_TOKEN_URI,
  };
}

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
  fetchImpl: typeof fetch = fetch,
): PlayIntegrityHttpClient {
  return {
    async decodeIntegrityToken(integrityToken, packageName) {
      const assertion = await signServiceAccountAssertion(credentials);
      const tokenResponse = await fetchImpl(credentials.tokenUri, {
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

      const decodeResponse = await fetchImpl(
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
