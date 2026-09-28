/**
 * The Google Play Integrity client against recorded-shape responses from Google's OAuth2 token
 * endpoint and `decodeIntegrityToken`: the signed JWT-bearer assertion, the decode request, the
 * verdict checks on a standard (request-hash) token, and how the api env turns it on.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createGooglePlayIntegrityHttpClient,
  normalizeCertificateDigest,
  parseGoogleServiceAccount,
  verifyPlayIntegrity,
} from '../../src/abuse/attestation/play-integrity';
import { buildAndroidAttestationFromEnv } from '../../src/abuse/attestation/play-integrity-env';

const FIXTURES_DIR = path.join(import.meta.dirname, '../fixtures/play-integrity');
const fixture = (name: string): string => readFileSync(path.join(FIXTURES_DIR, name), 'utf8');

const PACKAGE_NAME = 'app.critterpass.staging';
const CHALLENGE = 'Q2hhbGxlbmdlLWZyb20tdGhlLWFwaQ';
const CERT_COLON_HEX =
  '8F:EF:D9:82:4D:67:92:B1:20:36:25:D8:06:45:21:96:C5:C0:BC:95:EE:18:5A:FF:C4:16:34:B6:47:E7:85:4C';
const CERT_BASE64URL = 'j-_Zgk1nkrEgNiXYBkUhlsXAvJXuGFr_xBY0tkfnhUw';
const CLIENT_EMAIL = 'play-integrity@critterpass-test.iam.gserviceaccount.com';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

interface RecordedRequest {
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
}

function replay(responses: { status: number; body: string }[]) {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    requests.push({
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return Promise.resolve(
      new Response(next.body, {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { requests, fetchImpl };
}

let serviceAccountJson: string;
let publicKeyPem: string;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  publicKeyPem = await exportSPKI(publicKey);
  serviceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: 'critterpass-test',
    private_key_id: 'test-key-id',
    private_key: await exportPKCS8(privateKey),
    client_email: CLIENT_EMAIL,
    token_uri: TOKEN_URI,
  });
});

describe('createGooglePlayIntegrityHttpClient', () => {
  it('exchanges a signed service-account assertion, then decodes the token for the package', async () => {
    const { requests, fetchImpl } = replay([
      { status: 200, body: fixture('google-oauth-token-success.json') },
      { status: 200, body: fixture('decode-integrity-token-standard.json') },
    ]);
    const http = createGooglePlayIntegrityHttpClient(
      parseGoogleServiceAccount(serviceAccountJson),
      fetchImpl,
    );

    const result = await verifyPlayIntegrity({
      integrityToken: 'integrity-token-from-device',
      expectedNonce: CHALLENGE,
      config: { packageName: PACKAGE_NAME, certificateSha256Digests: [CERT_COLON_HEX] },
      http,
    });
    expect(result.deviceRecognitionVerdict).toEqual(['MEETS_DEVICE_INTEGRITY']);

    const [tokenRequest, decodeRequest] = requests;
    expect(tokenRequest?.url).toBe(TOKEN_URI);
    const form = new URLSearchParams(tokenRequest?.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const { payload } = await jwtVerify(
      form.get('assertion') ?? '',
      await importSPKI(publicKeyPem, 'RS256'),
      { issuer: CLIENT_EMAIL, audience: TOKEN_URI },
    );
    expect(payload['scope']).toBe('https://www.googleapis.com/auth/playintegrity');

    expect(decodeRequest?.url).toBe(
      `https://playintegrity.googleapis.com/v1/${PACKAGE_NAME}:decodeIntegrityToken`,
    );
    expect(decodeRequest?.headers.get('authorization')).toBe('Bearer ya29.c.example-access-token');
    expect(JSON.parse(decodeRequest?.body ?? '')).toEqual({
      integrityToken: 'integrity-token-from-device',
    });
  });

  it('rejects an app Play does not recognise (sideloaded or re-signed)', async () => {
    const { fetchImpl } = replay([
      { status: 200, body: fixture('google-oauth-token-success.json') },
      { status: 200, body: fixture('decode-integrity-token-sideloaded.json') },
    ]);
    await expect(
      verifyPlayIntegrity({
        integrityToken: 'token',
        expectedNonce: CHALLENGE,
        config: { packageName: PACKAGE_NAME, certificateSha256Digests: [CERT_BASE64URL] },
        http: createGooglePlayIntegrityHttpClient(
          parseGoogleServiceAccount(serviceAccountJson),
          fetchImpl,
        ),
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_FAILED' });
  });

  it('names the reported digest when the signing certificate is not an accepted one', async () => {
    const { fetchImpl } = replay([
      { status: 200, body: fixture('google-oauth-token-success.json') },
      { status: 200, body: fixture('decode-integrity-token-standard.json') },
    ]);
    await expect(
      verifyPlayIntegrity({
        integrityToken: 'token',
        expectedNonce: CHALLENGE,
        config: { packageName: PACKAGE_NAME, certificateSha256Digests: [] },
        http: createGooglePlayIntegrityHttpClient(
          parseGoogleServiceAccount(serviceAccountJson),
          fetchImpl,
        ),
      }),
    ).rejects.toMatchObject({
      code: 'ATTESTATION_FAILED',
      detail: { reason: expect.stringContaining(CERT_BASE64URL) as unknown },
    });
  });

  it('reports Google being unavailable when the token exchange or the decode call fails', async () => {
    const credentials = parseGoogleServiceAccount(serviceAccountJson);
    const badGrant = replay([
      { status: 400, body: fixture('google-oauth-token-invalid-grant.json') },
    ]);
    await expect(
      createGooglePlayIntegrityHttpClient(credentials, badGrant.fetchImpl).decodeIntegrityToken(
        'token',
        PACKAGE_NAME,
      ),
    ).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });

    const denied = replay([
      { status: 200, body: fixture('google-oauth-token-success.json') },
      { status: 403, body: fixture('decode-integrity-token-permission-denied.json') },
    ]);
    await expect(
      createGooglePlayIntegrityHttpClient(credentials, denied.fetchImpl).decodeIntegrityToken(
        'token',
        PACKAGE_NAME,
      ),
    ).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });
  });
});

describe('parseGoogleServiceAccount', () => {
  it('reads the key fields and defaults the token uri', () => {
    const credentials = parseGoogleServiceAccount(
      JSON.stringify({ client_email: CLIENT_EMAIL, private_key: 'pem' }),
    );
    expect(credentials).toEqual({
      clientEmail: CLIENT_EMAIL,
      privateKeyPem: 'pem',
      tokenUri: TOKEN_URI,
    });
  });

  it('rejects malformed JSON and keys missing their credentials without echoing the value', () => {
    expect(() => parseGoogleServiceAccount('{not json')).toThrow('not valid JSON');
    expect(() => parseGoogleServiceAccount('{"client_email":"x"}')).toThrow('private_key');
  });
});

describe('normalizeCertificateDigest', () => {
  it('turns Play Console colon hex into the URL-safe base64 Google reports', () => {
    expect(normalizeCertificateDigest(CERT_COLON_HEX)).toBe(CERT_BASE64URL);
    expect(normalizeCertificateDigest(CERT_COLON_HEX.toLowerCase())).toBe(CERT_BASE64URL);
  });

  it('keeps URL-safe base64 as is and converts padded standard base64', () => {
    expect(normalizeCertificateDigest(CERT_BASE64URL)).toBe(CERT_BASE64URL);
    const standard = Buffer.from(CERT_BASE64URL, 'base64url').toString('base64');
    expect(normalizeCertificateDigest(standard)).toBe(CERT_BASE64URL);
  });
});

describe('buildAndroidAttestationFromEnv', () => {
  const base = {
    APP_ENV: 'staging',
    ATTESTATION_MODE: 'enforce',
    PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: undefined,
    PLAY_INTEGRITY_PACKAGE_NAME: undefined,
    PLAY_INTEGRITY_CERT_SHA256_DIGESTS: undefined,
  } as const;

  it('leaves Android unverified and in log mode without a service account', () => {
    expect(buildAndroidAttestationFromEnv(base)).toEqual({
      androidMode: 'log',
      android: undefined,
    });
  });

  it('verifies but stays in log mode until signing certificate digests are set', () => {
    const setup = buildAndroidAttestationFromEnv({
      ...base,
      PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: serviceAccountJson,
    });
    expect(setup.androidMode).toBe('log');
    expect(setup.android?.playIntegrity).toEqual({
      packageName: 'app.critterpass.staging',
      certificateSha256Digests: [],
    });
  });

  it('follows ATTESTATION_MODE once digests are set, with the package override', () => {
    const setup = buildAndroidAttestationFromEnv({
      ...base,
      APP_ENV: 'production',
      PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: serviceAccountJson,
      PLAY_INTEGRITY_CERT_SHA256_DIGESTS: ` ${CERT_COLON_HEX} , ${CERT_BASE64URL}`,
    });
    expect(setup.androidMode).toBe('enforce');
    expect(setup.android?.playIntegrity).toEqual({
      packageName: 'app.critterpass',
      certificateSha256Digests: [CERT_COLON_HEX, CERT_BASE64URL],
    });
    expect(
      buildAndroidAttestationFromEnv({
        ...base,
        ATTESTATION_MODE: 'log',
        PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: serviceAccountJson,
        PLAY_INTEGRITY_PACKAGE_NAME: 'app.critterpass.dev',
        PLAY_INTEGRITY_CERT_SHA256_DIGESTS: CERT_BASE64URL,
      }),
    ).toMatchObject({
      androidMode: 'log',
      android: { playIntegrity: { packageName: 'app.critterpass.dev' } },
    });
  });

  it('fails at boot on a malformed service account key', () => {
    expect(() =>
      buildAndroidAttestationFromEnv({ ...base, PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: '{' }),
    ).toThrow('not valid JSON');
  });
});
