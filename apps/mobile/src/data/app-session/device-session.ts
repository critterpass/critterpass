/**
 * The real dependencies behind `startAppSession`: the Better Auth Expo client against this build's
 * api, the SQLCipher PowerSync database, the App Group (cp-app-group), React Native's `AppState`
 * and the persisted realtime positions. Not unit-tested itself (it only hands native modules over); the sequence it starts
 * is tested on a real database in __tests__/start-app-session.test.ts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: wire values and a
   developer-facing log prefix, never copy. */
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { createAuthDataLayer, createMobileAuthClient } from '../auth';
import { createDeviceResolver } from '../commands/device';
import type { ExtensionOutbox } from '../commands/drain-extension-outbox';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import { startLocalFirst } from '../powersync/db';
import type { AppStateSource } from '../realtime/client';
import { createDeviceRecoveryStore } from '../realtime/device-recovery-store';
import { appEnvironment, endpointsConfigJson, resolveRealtimeUrl } from './endpoints';
import { startAppSession, type AppSession } from './start-app-session';

function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return first ?? 'critterpass';
}

/** Background failures stay out of the UI; they surface in the device log. */
export function reportAppSessionError(error: unknown): void {
  console.warn('[app-session]', error);
}

const storage = createMMKV({ id: 'cp-app-session' });
const LAST_UID_KEY = 'cp.session.last_uid';

/** React Native's `AppState`; before the first report it counts as foreground. */
export const deviceAppState: AppStateSource = {
  get currentState() {
    return AppState.currentState ?? 'active';
  },
  addEventListener: (type, listener) => AppState.addEventListener(type, listener),
};

/** The App Group as the cp-app-group native module exposes it (passed in by the root route). */
export interface AppGroupAccess {
  readonly outbox: ExtensionOutbox;
  writeEndpointsConfig(json: string): void;
}

let starting: Promise<AppSession> | null = null;

/** Starts the app's session once per process; a failed start (e.g. offline) retries on next call. */
export function startDeviceAppSession(appGroup: AppGroupAccess): Promise<AppSession> {
  starting ??= createSession(appGroup).catch((error: unknown) => {
    starting = null;
    throw error;
  });
  return starting;
}

function createSession(appGroup: AppGroupAccess): Promise<AppSession> {
  const client = createMobileAuthClient({ baseUrl: resolveApiBaseUrl(), scheme: appScheme() });
  const auth = createAuthDataLayer(client);
  return startAppSession({
    writeEndpoints: () =>
      appGroup.writeEndpointsConfig(
        endpointsConfigJson({
          env: appEnvironment(Constants.expoConfig?.extra?.appVariant),
          apiBaseUrl: resolveApiBaseUrl(),
          now: new Date(),
        }),
      ),
    auth: {
      ensureAnonymous: () => auth.ensureAnonymous(),
      getSyncToken: () => auth.getSyncToken(),
      getRealtimeToken: () => auth.getRealtimeToken(),
      sessionHeaders: async () => ({ cookie: await client.getCookie() }),
    },
    lastUid: {
      read: () => storage.getString(LAST_UID_KEY) ?? null,
      write: (uid) => storage.set(LAST_UID_KEY, uid),
      clear: () => {
        storage.remove(LAST_UID_KEY);
      },
    },
    startLocalFirst,
    outbox: appGroup.outbox,
    device: createDeviceResolver(),
    appState: deviceAppState,
    realtime: { url: resolveRealtimeUrl(), positions: createDeviceRecoveryStore() },
    onError: reportAppSessionError,
  });
}
