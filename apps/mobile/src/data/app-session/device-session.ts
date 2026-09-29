/**
 * The real dependencies behind `startAppSession`: the Better Auth Expo client against this build's
 * api, the SQLCipher PowerSync database, the App Group (cp-app-group), React Native's `AppState`
 * and the persisted realtime positions. Not unit-tested itself (it only hands native modules
 * over); the sequence it starts is tested on a real database in __tests__/start-app-session.test.tsx.
 *
 * The root route hands the App Group over once (`configureDeviceAppGroup`), since native modules
 * are imported by routes only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: wire values and a
   developer-facing log prefix, never copy. */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { getCalendars, getLocales } from 'expo-localization';
import { AppState, Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { createLinkResolverClient, type ClaimDevice } from '../../lib/links/resolver-client';
import type { FixUpload } from '../../lib/location';
import {
  createAuthDataLayer,
  createMobileAuthClient,
  type AuthDataLayer,
  type MobileAuthClient,
} from '../auth';
import { createDeviceAttestor } from '../auth/device-attestor';
import { createDeviceResolver } from '../commands/device';
import type { ExtensionOutbox } from '../commands/drain-extension-outbox';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import { startLocalFirst } from '../powersync/db';
import { createFetchTransport } from '../powersync/transport';
import { expoPushNative, secureInstallIdStorage } from '../push/expo-native';
import type { PushLifecycleDeps } from '../push/use-push-lifecycle';
import type { AppStateSource } from '../realtime/client';
import { createDeviceRecoveryStore } from '../realtime/device-recovery-store';
import { appEnvironment, endpointsConfigJson, resolveRealtimeUrl } from './endpoints';
import { createLinksHttp } from './links-http';
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

let appGroup: AppGroupAccess | null = null;

export function configureDeviceAppGroup(access: AppGroupAccess): void {
  appGroup = access;
}

let client: MobileAuthClient | null = null;

function authClient(): MobileAuthClient {
  client ??= createMobileAuthClient({
    baseUrl: resolveApiBaseUrl(),
    scheme: appScheme(),
    attestor: createDeviceAttestor(resolveApiBaseUrl()),
  });
  return client;
}

/** The session cookie for authenticated api requests outside the command path (presign, geo). */
export async function sessionHeaders(): Promise<Record<string, string>> {
  return { cookie: await authClient().getCookie() };
}

let auth: AuthDataLayer | null = null;

/** The auth flows screens run (save your pass, phone sign-in, returning sign-in), on the app's one client. */
export function deviceAuth(): AuthDataLayer {
  auth ??= createAuthDataLayer(authClient(), { apiBaseUrl: resolveApiBaseUrl() });
  return auth;
}

let starting: Promise<AppSession> | null = null;

/** Starts the app's session once per process; a failed start (e.g. offline) retries on next call. */
export function startDeviceAppSession(): Promise<AppSession> {
  starting ??= createSession().catch((error: unknown) => {
    starting = null;
    throw error;
  });
  return starting;
}

const deviceResolver = createDeviceResolver();

/**
 * The first-launch deferred link claim (features/launch/DeferredLinkGate.tsx). The claim is
 * signed-in, so it waits for the session start (the deferred check bounds the wait) and goes out
 * with whatever session exists by then.
 */
export const deviceLinkClaims = {
  client: createLinkResolverClient(
    createLinksHttp({
      baseUrl: resolveApiBaseUrl(),
      sessionHeaders: async () => {
        await startDeviceAppSession().catch(() => undefined);
        return sessionHeaders();
      },
    }),
  ),
  async device(): Promise<ClaimDevice> {
    const device = await deviceResolver();
    return { ...device, platform: device.platform === 'android' ? 'android' : 'ios' };
  },
};

function createSession(): Promise<AppSession> {
  const group = appGroup;
  if (group === null) {
    return Promise.reject(new Error('configureDeviceAppGroup must run before the session starts'));
  }
  const auth = deviceAuth();
  return startAppSession({
    writeEndpoints: () =>
      group.writeEndpointsConfig(
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
      sessionHeaders,
    },
    lastUid: {
      read: () => storage.getString(LAST_UID_KEY) ?? null,
      write: (uid) => storage.set(LAST_UID_KEY, uid),
      clear: () => {
        storage.remove(LAST_UID_KEY);
      },
    },
    startLocalFirst,
    outbox: group.outbox,
    device: deviceResolver,
    appState: deviceAppState,
    linksHttp: createLinksHttp({ baseUrl: resolveApiBaseUrl(), sessionHeaders }),
    realtime: { url: resolveRealtimeUrl(), positions: createDeviceRecoveryStore() },
    onError: reportAppSessionError,
  });
}

function pushPlatform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

function devicePushDeps(): PushLifecycleDeps | undefined {
  const platform = pushPlatform();
  if (platform === null) return undefined;
  const transport = createFetchTransport({ baseUrl: resolveApiBaseUrl(), sessionHeaders });
  const bundleId = Application.applicationId;
  return {
    native: expoPushNative,
    transport: (cmd, envelope) => transport.postJson(`/v1/cmd/${cmd}`, envelope),
    storage: secureInstallIdStorage,
    // Registration waits for the session; before one exists (offline first launch) it skips and
    // the next foreground tries again.
    currentUid: () =>
      startDeviceAppSession().then(
        (session) => session.uid,
        () => undefined,
      ),
    platform,
    ...(bundleId !== null ? { bundleId } : {}),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    osVersion: String(Platform.Version),
    locale: () => getLocales()[0]?.languageTag ?? 'en',
    timeZone: () => getCalendars()[0]?.timeZone ?? 'UTC',
    subscribeAppState: (listener) => {
      const subscription = AppState.addEventListener('change', listener);
      return () => subscription.remove();
    },
    onError: reportAppSessionError,
  };
}

/** Push registration for the root; undefined on platforms without push. */
export const devicePush = devicePushDeps();

const deviceApi = createFetchTransport({ baseUrl: resolveApiBaseUrl(), sessionHeaders });

/** Live fixes for the user's open share (`POST /v1/loc`); never queued, never stored. */
export function uploadLocationFixes(batch: FixUpload): Promise<{ readonly status: number }> {
  return deviceApi
    .postJson('/v1/loc', { share_id: batch.shareId, fixes: batch.fixes })
    .then((response) => ({ status: response.status }));
}

/** The uid of the running session, once it has started. */
export function deviceSessionUid(): Promise<string> {
  return startDeviceAppSession().then((session) => session.uid);
}
