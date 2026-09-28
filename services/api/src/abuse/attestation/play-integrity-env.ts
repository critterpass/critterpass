/**
 * Android attestation config from the api env: Play Integrity runs once a service-account key for
 * the Google Cloud project linked in Play Console is provisioned. Without accepted signing
 * certificate digests every verdict would fail the certificate check, so Android then stays in
 * `log` mode whatever ATTESTATION_MODE says (the failures log the digest devices report).
 */
import type { ApiEnv } from '../../env';

import {
  createGooglePlayIntegrityHttpClient,
  parseGoogleServiceAccount,
  type PlayIntegrityHttpClient,
} from './play-integrity';

import type { AndroidAttestationConfig, AttestationMode } from './index';

export type PlayIntegrityEnv = Pick<
  ApiEnv,
  | 'APP_ENV'
  | 'ATTESTATION_MODE'
  | 'PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON'
  | 'PLAY_INTEGRITY_PACKAGE_NAME'
  | 'PLAY_INTEGRITY_CERT_SHA256_DIGESTS'
>;

/** The Android package each deployment tier's builds ship as (apps/mobile/app.config.ts variants). */
const PACKAGE_BY_APP_ENV: Record<ApiEnv['APP_ENV'], string> = {
  local: 'app.critterpass.dev',
  staging: 'app.critterpass.staging',
  production: 'app.critterpass',
};

export interface AndroidAttestationSetup {
  readonly androidMode: AttestationMode;
  readonly android: AndroidAttestationConfig | undefined;
}

export function buildAndroidAttestationFromEnv(
  env: PlayIntegrityEnv,
  createHttp: (json: string) => PlayIntegrityHttpClient = (json) =>
    createGooglePlayIntegrityHttpClient(parseGoogleServiceAccount(json)),
): AndroidAttestationSetup {
  if (!env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON) return { androidMode: 'log', android: undefined };
  const certificateSha256Digests = (env.PLAY_INTEGRITY_CERT_SHA256_DIGESTS ?? '')
    .split(',')
    .map((digest) => digest.trim())
    .filter(Boolean);
  return {
    androidMode: certificateSha256Digests.length > 0 ? env.ATTESTATION_MODE : 'log',
    android: {
      playIntegrity: {
        packageName: env.PLAY_INTEGRITY_PACKAGE_NAME ?? PACKAGE_BY_APP_ENV[env.APP_ENV],
        certificateSha256Digests,
      },
      http: createHttp(env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON),
    },
  };
}
