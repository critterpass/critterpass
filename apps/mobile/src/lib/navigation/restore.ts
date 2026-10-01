import type { NavigationContainerRefWithCurrent } from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { useSessionGate, type SessionGateState } from './gates';

/** Navigation state older than this is not restored on a cold start (plan decision: 30 min). */
export const RESTORE_WINDOW_MS = 30 * 60 * 1000;

const STORAGE_KEY = 'cp.navigation.state';
// createMMKV() returns react-native-mmkv's own in-memory store under Jest (its isTest() check).
const storage = createMMKV();

export interface SavedNavigation {
  readonly savedAt: number;
  /** App build the state belongs to: route names can change between builds. */
  readonly build: string;
  readonly state: object;
}

/** A launch URL that points at a screen (not just the app scheme or the dev client's own URL). */
export function isDeepLinkLaunch(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol.startsWith('exp')) return false;
    const target = `${parsed.host}${parsed.pathname}`.replace(/^\/+|\/+$/g, '');
    return target.length > 0;
  } catch {
    return false;
  }
}

export function shouldRestore(
  saved: SavedNavigation | undefined,
  now: number,
  build: string,
  launchUrl: string | null,
): saved is SavedNavigation {
  if (!saved || saved.build !== build) return false;
  if (isDeepLinkLaunch(launchUrl)) return false;
  const age = now - saved.savedAt;
  return age >= 0 && age < RESTORE_WINDOW_MS;
}

export function readSavedNavigation(): SavedNavigation | undefined {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedNavigation>;
    if (typeof parsed.savedAt !== 'number' || typeof parsed.build !== 'string') return undefined;
    if (typeof parsed.state !== 'object' || parsed.state === null) return undefined;
    return { savedAt: parsed.savedAt, build: parsed.build, state: parsed.state };
  } catch {
    return undefined;
  }
}

export function writeSavedNavigation(saved: SavedNavigation): void {
  storage.set(STORAGE_KEY, JSON.stringify(saved));
}

export function clearSavedNavigation(): void {
  storage.remove(STORAGE_KEY);
}

export interface RestoreMoment {
  /** The session gate: a signed-out or first-run launch (`signedOut`, `onboarding`) never restores. */
  readonly gate: SessionGateState['status'];
  /** The session's local database is open, so a restored screen has data to read. */
  readonly sessionReady: boolean;
  /** The person has left the launch screen since the app opened. */
  readonly navigated: boolean;
  readonly saved: SavedNavigation | undefined;
  readonly now: number;
  readonly build: string;
  readonly launchUrl: string | null;
}

/**
 * What a cold start does with the saved navigation at this moment. It waits for the session gate
 * and, for a signed-in launch, for the local database: screens read it as soon as they mount, so
 * a state restored earlier fails to load. A person who has already gone somewhere is left there.
 */
export function decideRestore(moment: RestoreMoment): 'wait' | 'restore' | 'skip' {
  if (moment.gate === 'loading') return 'wait';
  if (moment.gate !== 'ready' || moment.navigated) return 'skip';
  if (!shouldRestore(moment.saved, moment.now, moment.build, moment.launchUrl)) return 'skip';
  return moment.sessionReady ? 'restore' : 'wait';
}

type RootRef = NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>;

export interface NavigationPersistenceOptions {
  readonly navigationRef: RootRef;
  readonly build: string;
  /** The URL the app was launched with (`Linking.getInitialURL()`); `null` for a plain launch. */
  readonly launchUrl: string | null | undefined;
  readonly now?: () => number;
}

/**
 * Saves the root navigation state on every change of a signed-in session and, once per cold
 * start, restores the saved one when it is fresh (< 30 min), from this build, the launch wasn't a
 * deep link (the link router owns those), the session's local database is open and the person is
 * still on the launch screen. `launchUrl` is `undefined` while still being read; restore waits for
 * it.
 */
export function useNavigationPersistence({
  navigationRef,
  build,
  launchUrl,
  now = Date.now,
}: NavigationPersistenceOptions): void {
  const sessionReady = useContext(LocalFirstContext) !== null;
  const gate = useSessionGate().status;
  // Nothing is saved until the restore decision is made, so the launch's own first state can't
  // overwrite the state being restored.
  const decided = useRef(false);
  // The screen the launch opened on, and whether the person has left it since.
  const launchRoute = useRef<string | undefined>(undefined);
  const navigated = useRef(false);

  useEffect(() => {
    const decide = () => {
      if (decided.current || launchUrl === undefined || !navigationRef.isReady()) return;
      const route = navigationRef.getCurrentRoute()?.key;
      launchRoute.current ??= route;
      if (route !== launchRoute.current) navigated.current = true;
      const saved = readSavedNavigation();
      const decision = decideRestore({
        gate,
        sessionReady,
        navigated: navigated.current,
        saved,
        now: now(),
        build,
        launchUrl,
      });
      if (decision === 'wait') return;
      decided.current = true;
      // A signed-out launch has no use for the screens of the session that was there before.
      if (gate !== 'ready') clearSavedNavigation();
      if (decision === 'skip' || saved === undefined) return;
      // After the first frame: the root navigator only accepts actions once it has mounted.
      requestAnimationFrame(() => {
        try {
          navigationRef.reset(saved.state as Parameters<RootRef['reset']>[0]);
        } catch {
          clearSavedNavigation();
        }
      });
    };
    decide();
    return navigationRef.addListener('state', () => {
      decide();
      // A signed-out or first-run session saves nothing: its screens are not a place to return to.
      if (!decided.current || gate !== 'ready') return;
      const state = navigationRef.getRootState();
      if (state) writeSavedNavigation({ savedAt: now(), build, state });
    });
  }, [navigationRef, build, launchUrl, now, gate, sessionReady]);
}
