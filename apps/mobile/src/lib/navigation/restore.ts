import type { NavigationContainerRefWithCurrent } from 'expo-router/react-navigation';
import { useEffect, useRef } from 'react';
import { createMMKV } from 'react-native-mmkv';

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

interface NavigationStateLike {
  readonly index?: number;
  readonly routes?: readonly { readonly name?: string; readonly state?: NavigationStateLike }[];
}

/** The names of the focused screens, outermost navigator first. */
export function focusedPath(state: NavigationStateLike | undefined): string[] {
  const path: string[] = [];
  let current = state;
  while (current?.routes !== undefined && current.routes.length > 0) {
    // A state not yet taken up by its navigator has no index: its last route is the focused one.
    const route = current.routes[current.index ?? current.routes.length - 1];
    if (route?.name === undefined) break;
    path.push(route.name);
    current = route.state;
  }
  return path;
}

/**
 * Whether the person has left the screen the app opened on. During a launch the navigators mount
 * one inside the other, and each fills in its own first screen under the same names: that is the
 * launch settling, not a move. A different screen at any level is one.
 */
export function leftLaunchScreen(launch: readonly string[], current: readonly string[]): boolean {
  const shared = Math.min(launch.length, current.length);
  for (let depth = 0; depth < shared; depth += 1) {
    if (launch[depth] !== current[depth]) return true;
  }
  return false;
}

type RootRef = NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>;

export interface NavigationPersistenceOptions {
  readonly navigationRef: RootRef;
  readonly build: string;
  /** The URL the app was launched with (`Linking.getInitialURL()`); `null` for a plain launch. */
  readonly launchUrl: string | null | undefined;
  /** The session's local database is open: restored screens read it as soon as they mount. */
  readonly sessionReady: boolean;
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
  sessionReady,
  now = Date.now,
}: NavigationPersistenceOptions): void {
  const gate = useSessionGate().status;
  // Nothing is saved until the restore decision is made, so the launch's own first state can't
  // overwrite the state being restored.
  const decided = useRef(false);
  // The screens the launch opened on, and whether the person has left them since.
  const launchPath = useRef<readonly string[] | undefined>(undefined);
  const navigated = useRef(false);

  useEffect(() => {
    const decide = () => {
      if (decided.current || launchUrl === undefined || !navigationRef.isReady()) return;
      const path = focusedPath(navigationRef.getRootState());
      // The longest path seen so far is the launch screen: navigators add to it as they mount.
      if (launchPath.current === undefined || !leftLaunchScreen(launchPath.current, path)) {
        if (path.length >= (launchPath.current?.length ?? 0)) launchPath.current = path;
      } else {
        navigated.current = true;
      }
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
