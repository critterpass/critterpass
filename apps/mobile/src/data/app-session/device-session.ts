/**
 * The real dependencies behind `startAppSession`: the Better Auth Expo client against this build's
 * api, the SQLCipher PowerSync database, React Native's `AppState` and the persisted realtime
 * positions. Not unit-tested itself (it only hands native modules over); the sequence it starts
 * is tested on a real database in __tests__/start-app-session.test.ts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: wire values and a
   developer-facing log prefix, never copy. */
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { createAuthDataLayer, createMobileAuthClient, registerOnSignOut } from '../auth';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import { startLocalFirst } from '../powersync/db';
import type { AppStateSource } from '../realtime/client';
import { createDeviceRecoveryStore } from '../realtime/device-recovery-store';
import { resolveRealtimeUrl } from './endpoints';
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

// Signed out, merged or revoked: an offline launch must not reopen the previous uid's data.
registerOnSignOut(() => {
  storage.remove(LAST_UID_KEY);
});

/** React Native's `AppState`; before the first report it counts as foreground. */
export const deviceAppState: AppStateSource = {
  get currentState() {
    return AppState.currentState ?? 'active';
  },
  addEventListener: (type, listener) => AppState.addEventListener(type, listener),
};

let starting: Promise<AppSession> | null = null;

/** Starts the app's session once per process; a failed start (e.g. offline) retries on next call. */
export function startDeviceAppSession(): Promise<AppSession> {
  starting ??= createSession().catch((error: unknown) => {
    starting = null;
    throw error;
  });
  return starting;
}

function createSession(): Promise<AppSession> {
  const client = createMobileAuthClient({ baseUrl: resolveApiBaseUrl(), scheme: appScheme() });
  const auth = createAuthDataLayer(client);
  return startAppSession({
    auth: {
      ensureAnonymous: () => auth.ensureAnonymous(),
      getSyncToken: () => auth.getSyncToken(),
      getRealtimeToken: () => auth.getRealtimeToken(),
      sessionHeaders: async () => ({ cookie: await client.getCookie() }),
    },
    lastUid: {
      read: () => storage.getString(LAST_UID_KEY) ?? null,
      write: (uid) => storage.set(LAST_UID_KEY, uid),
    },
    startLocalFirst,
    appState: deviceAppState,
    realtime: { url: resolveRealtimeUrl(), positions: createDeviceRecoveryStore() },
  });
}
