/**
 * The session's one encounter engine over the phone's own services: the command queue (fed in by
 * the runtime once the local database is open), SHA-256 from expo-crypto, the App Attest key the
 * attestor stored, and the spawn candidates and `client_config` constants the runtime keeps fresh.
 * Native modules load lazily, so tests build their own engine instead.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys and algorithm names, never copy. */
import { DEFAULT_ENCOUNTER_CONFIG, generateUuidV7, type EncounterConfig } from '@cp/domain';
import type * as AppIntegrityModule from '@expo/app-integrity';
import type * as CryptoModule from 'expo-crypto';
import type * as SecureStoreModule from 'expo-secure-store';
import { Platform } from 'react-native';

import { createEncounterEngine, type EncounterEngine, type EngineCommands } from './engine';
import { ATTESTED_KEY_ID_KEY, createEvidenceSigner } from './evidence';
import type { SpawnCandidate } from './spawn-feed';

let engine: EncounterEngine | null = null;
let candidates: readonly SpawnCandidate[] = [];
let config: EncounterConfig = DEFAULT_ENCOUNTER_CONFIG;
let online: () => boolean = () => true;
let commands: EngineCommands | null = null;

export function setEncounterInputs(input: {
  readonly candidates: readonly SpawnCandidate[];
  readonly config: EncounterConfig;
  readonly online: () => boolean;
  readonly commands: EngineCommands;
}): void {
  candidates = input.candidates;
  config = input.config;
  online = input.online;
  commands = input.commands;
}

/** Commands queued before the runtime handed over the queue are dropped, never sent twice. */
const queue: EngineCommands = {
  start: (payload) => commands?.start(payload),
  report: (payload) => commands?.report(payload),
  end: (payload) => commands?.end(payload),
  befriend: (payload) => commands?.befriend(payload),
};

export function encounterEngine(): EncounterEngine {
  if (engine !== null) return engine;
  const secure = require('expo-secure-store') as typeof SecureStoreModule;
  const crypto = require('expo-crypto') as typeof CryptoModule;
  engine = createEncounterEngine({
    now: () => Date.now(),
    config: () => config,
    candidates: () => candidates,
    commands: queue,
    sign: createEvidenceSigner({
      platform: Platform.OS,
      keyId: () =>
        secure.getItemAsync(ATTESTED_KEY_ID_KEY, {
          keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      generateAssertion: (keyId, challenge) => {
        const integrity = require('@expo/app-integrity') as typeof AppIntegrityModule;
        return integrity.generateAssertionAsync(keyId, challenge);
      },
    }),
    sha256: (text) => crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, text),
    uuid: generateUuidV7,
    online: () => online(),
  });
  return engine;
}

/** Tests and the lab swap in their own engine. */
export function setEncounterEngine(next: EncounterEngine | null): void {
  engine = next;
}
