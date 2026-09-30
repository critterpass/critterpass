/**
 * Which launch hatch this cold start plays. The very first launch plays the full hatch on the
 * welcome screen; every later cold start plays the short "Tokek waves" beat over whatever screen
 * opens. Both read one snapshot taken when the JS runtime starts, so the two never play together,
 * and each plays at most once per runtime (a resume from the background never replays them).
 */
import { useSyncExternalStore } from 'react';
import { createMMKV, type MMKV } from 'react-native-mmkv';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an MMKV storage key, never rendered copy.
export const HATCHED_KEY = 'cp.launch.hatched';

export type LaunchHatchKind = 'full' | 'beat';

interface LaunchState {
  storage: MMKV | null;
  kind: LaunchHatchKind | null;
  played: Record<LaunchHatchKind, boolean>;
  /** The native launch screen has gone: the hatch is on screen and may start moving. */
  revealed: boolean;
  listeners: Set<() => void>;
}

const state: LaunchState = {
  storage: null,
  kind: null,
  played: { full: false, beat: false },
  revealed: false,
  listeners: new Set(),
};

function storage(): MMKV {
  state.storage ??= createMMKV();
  return state.storage;
}

/**
 * This runtime's hatch. The first read records that the app has hatched, so a launch that is cut
 * short still counts: the next cold start plays the beat, never the full hatch again.
 */
export function launchHatchKind(): LaunchHatchKind {
  if (state.kind === null) {
    const hatched = storage().getBoolean(HATCHED_KEY) === true;
    state.kind = hatched ? 'beat' : 'full';
    if (!hatched) storage().set(HATCHED_KEY, true);
  }
  return state.kind;
}

/**
 * Whether `kind` still has to play in this runtime: it is this launch's hatch and has not finished.
 * A remount mid-play (the root re-rendering its tree) plays it again rather than dropping it.
 */
export function launchHatchPending(kind: LaunchHatchKind): boolean {
  return launchHatchKind() === kind && !state.played[kind];
}

/** The hatch has faded: nothing replays it until the next cold start. */
export function finishLaunchHatch(kind: LaunchHatchKind): void {
  state.played[kind] = true;
}

/** The root layout calls this as it hides the native launch screen. */
export function markSplashRevealed(): void {
  if (state.revealed) return;
  state.revealed = true;
  for (const listener of state.listeners) listener();
}

function subscribe(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Whether the native launch screen has gone; a hatch waits for it before it starts moving. */
export function useSplashRevealed(): boolean {
  return useSyncExternalStore(subscribe, () => state.revealed);
}

/** Test seam: a fresh runtime over the given storage. */
export function resetLaunchStateForTests(next: MMKV): void {
  state.storage = next;
  state.kind = null;
  state.played = { full: false, beat: false };
  state.revealed = false;
  state.listeners.clear();
}
