import type { NavigationContainerRefWithCurrent } from 'expo-router/react-navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
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

/**
 * A launch from a link: any URL but the dev client's own (`exp…`). A link with a path opens that
 * path (the link router owns it) and a bare link (`critterpass://`, no path) opens Home, so neither
 * reopens the screens saved before.
 */
export function isLinkLaunch(url: string | null): boolean {
  if (!url) return false;
  try {
    return !new URL(url).protocol.startsWith('exp');
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
  if (isLinkLaunch(launchUrl)) return false;
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

let accountSwitched = false;

/**
 * The signed-in account is going (an account switch, a sign-out): the app opens on Home next,
 * never on the screens of the account before. Nothing is saved again until the app restarts.
 */
export function forgetNavigationForAccountSwitch(): void {
  accountSwitched = true;
  clearSavedNavigation();
}

/** Test-only: a fresh process, where nothing has switched accounts yet. */
export function resetAccountSwitchForTests(): void {
  accountSwitched = false;
}

/**
 * Hands the saved navigation to the build the app is about to restart into (an update applied
 * in place): the same screens, so the restore after the restart may take it. Its age is kept, so
 * the 30-minute window and every other restore rule still decide.
 */
export function carryNavigationTo(build: string): void {
  const saved = readSavedNavigation();
  if (saved !== undefined) writeSavedNavigation({ ...saved, build });
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
 * Whether the person has left the screen the app opened on (`launch`, from `focusedPath`). During a
 * launch the navigators mount one inside the other and fill in their own first screen, and a
 * redirect (`/` to the tabs) replaces a screen with another: both are the launch settling. A
 * person's move leaves the launch screen where it was, under a pushed screen or beside another tab,
 * so it is still among its navigator's routes but no longer the focused one.
 */
export function leftLaunchScreen(
  launch: readonly string[],
  state: NavigationStateLike | undefined,
): boolean {
  let current = state;
  for (const name of launch) {
    const routes = current?.routes;
    if (routes === undefined || routes.length === 0) return false;
    const focused = routes[current?.index ?? routes.length - 1];
    if (focused?.name !== name) return routes.some((route) => route.name === name);
    current = focused.state;
  }
  return false;
}

let sessionReady = false;
const sessionListeners = new Set<() => void>();

/**
 * Set by the app session (data/app-session) as its local database opens and closes: this layer
 * cannot import the data layer, and a restored screen reads that database as soon as it mounts.
 */
export function setSessionReady(ready: boolean): void {
  if (ready === sessionReady) return;
  sessionReady = ready;
  sessionListeners.forEach((listener) => listener());
}

function useSessionReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    () => sessionReady,
  );
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
 * link (bare or not: the link router owns those), the session's local database is open and the person is
 * still on the launch screen; an account switch saves nothing more. `launchUrl` is `undefined` while still being read; restore waits for
 * it.
 */
export function useNavigationPersistence({
  navigationRef,
  build,
  launchUrl,
  now = Date.now,
}: NavigationPersistenceOptions): void {
  const ready = useSessionReady();
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
      const state = navigationRef.getRootState();
      // Until the person moves, the launch screen is wherever the launch has settled so far.
      if (launchPath.current !== undefined && leftLaunchScreen(launchPath.current, state)) {
        navigated.current = true;
      } else {
        launchPath.current = focusedPath(state);
      }
      const saved = readSavedNavigation();
      const decision = decideRestore({
        gate,
        sessionReady: ready,
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
      if (!decided.current || gate !== 'ready' || accountSwitched) return;
      const state = navigationRef.getRootState();
      if (state) writeSavedNavigation({ savedAt: now(), build, state });
    });
  }, [navigationRef, build, launchUrl, now, gate, ready]);
}
