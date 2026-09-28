/**
 * The real `Attestor` (../../lib/attestation.ts): `@expo/app-integrity` for App Attest / Play
 * Integrity, SecureStore for the attested key id, the push install id as `X-CP-Install-Id`, and
 * `POST /v1/attest/challenge` for the single-use challenge. Not unit-tested itself: it only hands
 * native modules over; the decisions are tested against a fake native boundary.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and storage keys, never copy. */
import * as AppIntegrity from '@expo/app-integrity';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createAttestor, type AttestationKeyStore, type Attestor } from '../../lib/attestation';
import { secureInstallIdStorage } from '../push/expo-native';
import { getOrCreateInstallId } from '../push/register';

/** The Google Cloud project linked to the app's Play Integrity API. */
const CRITTERPASS_CLOUD_PROJECT_NUMBER = '963482787869';
const KEY_ID_KEY = 'cp.attest.key_id';
const KEYCHAIN = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function cloudProjectNumber(): string {
  const fromEnv = process.env['EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER'];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : CRITTERPASS_CLOUD_PROJECT_NUMBER;
}

const secureKeyStore: AttestationKeyStore = {
  get: () => SecureStore.getItemAsync(KEY_ID_KEY, KEYCHAIN),
  set: (keyId) => SecureStore.setItemAsync(KEY_ID_KEY, keyId, KEYCHAIN),
  clear: () => SecureStore.deleteItemAsync(KEY_ID_KEY, KEYCHAIN),
};

async function fetchChallenge(apiBaseUrl: string, installId: string): Promise<string> {
  const response = await fetch(new URL('/v1/attest/challenge', apiBaseUrl).href, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installId }),
  });
  if (!response.ok) throw Object.assign(new Error('challenge'), { code: 'challenge_failed' });
  const body = (await response.json()) as { challenge?: unknown };
  if (typeof body.challenge !== 'string') {
    throw Object.assign(new Error('challenge'), { code: 'challenge_failed' });
  }
  return body.challenge;
}

export function createDeviceAttestor(apiBaseUrl: string): Attestor {
  return createAttestor({
    platform: Platform.OS,
    native: AppIntegrity,
    installId: () => getOrCreateInstallId(secureInstallIdStorage),
    fetchChallenge: (installId) => fetchChallenge(apiBaseUrl, installId),
    keyStore: secureKeyStore,
    cloudProjectNumber: cloudProjectNumber(),
  });
}
