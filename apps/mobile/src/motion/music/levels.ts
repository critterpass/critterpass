import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { AudioSample } from 'expo-audio';

/**
 * The playing theme's real-time audio level (docs/design-system.md §4: "bars on the playing theme
 * move with real audio level"), 0–1. A module-level shared value (not a hook) so any waveform bar
 * anywhere can read it directly via `patterns/waveform.tsx`'s `useWaveformBar(musicLevel, ...)`,
 * independent of which component currently owns the crossfade engine.
 */
export const musicLevel: SharedValue<number> = makeMutable(0);

// Exponential moving average toward each new sample's RMS amplitude, so bars settle rather than
// flicker frame to frame (samples arrive far faster than a bar can usefully re-render).
const SMOOTHING = 0.35;

function rootMeanSquare(frames: readonly number[]): number {
  if (frames.length === 0) return 0;
  const sumSquares = frames.reduce((sum, frame) => sum + frame * frame, 0);
  return Math.sqrt(sumSquares / frames.length);
}

/** Feeds one `expo-audio` `AudioSample` event into the smoothed `musicLevel`. */
export function updateMusicLevelFromSample(sample: AudioSample): void {
  const frames = sample.channels[0]?.frames ?? [];
  const rms = rootMeanSquare(frames);
  musicLevel.value = musicLevel.value + (rms - musicLevel.value) * SMOOTHING;
}

export function resetMusicLevelForTests(): void {
  musicLevel.value = 0;
}
