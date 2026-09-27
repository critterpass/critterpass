import { createAudioPlayer } from 'expo-audio';

import { getFeedbackPrefsSnapshot } from '../feedback/prefs';
import { playCue } from '../feedback/sfx-pool';
import { crossfadeFraction, DEFAULT_CROSSFADE_MS, musicEngine } from './crossfade';
import { musicLevel } from './levels';
import { availableThemes, GUIDE_IDS, themeFor, type GuideId, type ThemeInfo } from './themes';

const DEFAULT_PREVIEW_GUIDE: GuideId = GUIDE_IDS[0];

function effectiveMusicVolume(): number {
  const prefs = getFeedbackPrefsSnapshot();
  return prefs.musicEnabled ? prefs.musicVolume : 0;
}

function playGuideTheme(guideId: GuideId, durationMs: number): void {
  musicEngine.setBaseVolume(effectiveMusicVolume());
  musicEngine.crossfadeTo(guideId, themeFor(guideId)?.asset, durationMs);
}

/**
 * The music engine (docs/design-system.md §4, this phase's Exports table): per-guide theme playback
 * with a 1.5 s crossfade on guide change, TTS/voice-mode ducking, settings-slider previews and a
 * real-audio-level meter for the playing theme's waveform bars (`level`, a `SharedValue<number>` —
 * see `music/levels.ts`).
 */
export const music = {
  /** Starts (or switches to) a guide's theme immediately, with no fade. */
  play(guideId: GuideId): void {
    playGuideTheme(guideId, 0);
  },
  /** Crossfades to a guide's theme over `durationMs` (default 1.5 s — landing in a destination, or tapping a theme card). */
  crossfadeTo(guideId: GuideId, durationMs: number = DEFAULT_CROSSFADE_MS): void {
    playGuideTheme(guideId, durationMs);
  },
  stop(): void {
    musicEngine.stop();
  },
  /** Ducks music −12 dB for TTS/voice mode; call the returned function to restore the previous volume. */
  duck(): () => void {
    return musicEngine.duck();
  },
  /** Plays a short sample at `level` (0–1) for the 3n-7 settings sliders: the playing guide's sample clip for `'music'`, a sticker slap for `'effects'`. */
  preview(kind: 'music' | 'effects', level: number): void {
    const clampedLevel = Math.max(0, Math.min(1, level));
    if (kind === 'effects') {
      playCue('slap', clampedLevel);
      return;
    }
    const guideId = (musicEngine.playingGuideId as GuideId | null) ?? DEFAULT_PREVIEW_GUIDE;
    const sampleAsset = themeFor(guideId)?.sampleAsset;
    if (!sampleAsset) return;
    const player = createAudioPlayer(sampleAsset);
    player.volume = clampedLevel;
    player.play();
  },
  /** Real-time audio level (0–1) of the currently playing theme, for `patterns/waveform.tsx`'s bars. */
  level: musicLevel,
  availableThemes,
  themeFor,
};

export { crossfadeFraction, DEFAULT_CROSSFADE_MS, GUIDE_IDS, musicEngine };
export type { GuideId, ThemeInfo };
