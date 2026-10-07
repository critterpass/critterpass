/**
 * A restart the app does itself (signing in to a saved pass, signing out) reloads the JS inside
 * the same OS process, and the OS still reports the URL that process was first opened with. That
 * link was followed once already: followed again it would put a fresh sign-in on that link's
 * screen instead of Home. The code about to restart leaves a mark here, and the next start reads
 * it once to know its launch URL is a replay.
 */
import { createMMKV } from 'react-native-mmkv';

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
const storage = createMMKV({ id: 'cp-links' });

const RESTART_KEY = 'cp.links.restarting';

/** A restart lands well inside this; a mark older than it belongs to a restart that never came. */
export const RESTART_MARK_TTL_MS = 30_000;

let replay: boolean | undefined;

/** Call right before reloading the JS (after any store wipe, which would remove the mark). */
export function markInAppRestart(now: number = Date.now()): void {
  storage.set(RESTART_KEY, now);
}

/**
 * Whether this start's launch URL is a replay. Decided once per start (the router asks for the
 * launch URL more than once) and the mark is removed, so the next cold start follows its link.
 */
export function isLaunchReplay(now: number = Date.now()): boolean {
  if (replay === undefined) {
    const markedAt = storage.getNumber(RESTART_KEY);
    storage.remove(RESTART_KEY);
    replay = markedAt !== undefined && now - markedAt >= 0 && now - markedAt < RESTART_MARK_TTL_MS;
  }
  return replay;
}

/** Test-only: a new start, where the launch URL has not been looked at yet. */
export function resetLaunchReplayForTests(): void {
  replay = undefined;
}
