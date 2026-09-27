import { setAudioModeAsync } from 'expo-audio';

/**
 * The audio session category (docs/design-system.md §4 audio rules): `ambient` is the default for
 * SFX and music — it respects the iOS silent switch and mixes with other apps' audio. `playback`
 * is acquired while TTS/voice mode is speaking so it keeps playing through the silent switch;
 * releasing it restores `ambient`. Refcounted because voice mode and a guide sample preview could
 * both request `playback` concurrently.
 */
export type AudioSessionCategory = 'ambient' | 'playback';

let playbackRefCount = 0;
let currentCategory: AudioSessionCategory = 'ambient';
// Serialises `setAudioModeAsync` calls so two racing acquire/release pairs cannot apply out of order.
let pendingApply: Promise<void> = Promise.resolve();

function applyCategory(category: AudioSessionCategory): Promise<void> {
  currentCategory = category;
  const mode =
    category === 'playback'
      ? { playsInSilentMode: true, interruptionMode: 'duckOthers' as const }
      : { playsInSilentMode: false, interruptionMode: 'mixWithOthers' as const };
  pendingApply = pendingApply
    .then(() => setAudioModeAsync(mode))
    .catch(() => {
      // No audio hardware/session available (e.g. a headless test environment): never crash a caller.
    });
  return pendingApply;
}

export function currentAudioSessionCategory(): AudioSessionCategory {
  return currentCategory;
}

/** Acquires the `playback` session (TTS, voice mode, a guide sample preview). Returns the release fn. */
export function acquirePlaybackSession(): () => void {
  playbackRefCount += 1;
  if (playbackRefCount === 1) void applyCategory('playback');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    playbackRefCount = Math.max(0, playbackRefCount - 1);
    if (playbackRefCount === 0) void applyCategory('ambient');
  };
}

/** Test-only: neither `playbackRefCount` nor `currentCategory` reset between test files on their own. */
export function resetAudioSessionForTests(): void {
  playbackRefCount = 0;
  currentCategory = 'ambient';
  pendingApply = Promise.resolve();
}
