/**
 * Whether this cold start plays the first-launch stamp (10.02). Only the very first launch does;
 * every later cold start goes straight in. One snapshot per JS runtime, taken on the first read,
 * which also records the issue moment, so a launch cut short still counts and the stamp's date is
 * the day the pass was issued. A phone that already played the earlier launch hatch has launched
 * before and skips the stamp too.
 */
import { createMMKV, type MMKV } from 'react-native-mmkv';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an MMKV storage key, never rendered copy.
export const ISSUED_KEY = 'cp.launch.issued_at';
/** The earlier launch hatch's marker: set means this phone has launched the app before. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- an MMKV storage key, never rendered copy.
export const EARLIER_LAUNCH_KEY = 'cp.launch.hatched';

interface LaunchState {
  storage: MMKV | null;
  first: boolean | null;
  issuedAt: number;
  played: boolean;
}

const state: LaunchState = { storage: null, first: null, issuedAt: 0, played: false };

function storage(): MMKV {
  state.storage ??= createMMKV();
  return state.storage;
}

/** Whether this runtime is the app's first launch on this phone. */
export function isFirstLaunch(now: () => number = Date.now): boolean {
  if (state.first === null) {
    const store = storage();
    const issued = store.getNumber(ISSUED_KEY);
    const launchedBefore = issued !== undefined || store.getBoolean(EARLIER_LAUNCH_KEY) === true;
    state.first = !launchedBefore;
    state.issuedAt = issued ?? now();
    if (issued === undefined) store.set(ISSUED_KEY, state.issuedAt);
    if (!launchedBefore) store.set(EARLIER_LAUNCH_KEY, true);
  }
  return state.first;
}

/** The moment the pass was issued: this phone's first launch. */
export function issuedAt(): Date {
  isFirstLaunch();
  return new Date(state.issuedAt);
}

/** The stamp still has to play in this runtime (a remount mid-play plays it again). */
export function premiumLaunchPending(): boolean {
  return isFirstLaunch() && !state.played;
}

/** The stamp has played: nothing replays it. */
export function finishPremiumLaunch(): void {
  state.played = true;
}

/** Test seam: a fresh runtime over the given storage. */
export function resetPremiumLaunchForTests(next: MMKV): void {
  state.storage = next;
  state.first = null;
  state.issuedAt = 0;
  state.played = false;
}
