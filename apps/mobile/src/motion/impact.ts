import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { tokens } from '@cp/design-tokens';

/**
 * Every `sound.tokens.json` cue id, spelled out explicitly (rather than derived from `typeof
 * tokens.sound.cue`, whose declared type is a generic string index) so a typo is a compile error.
 * `impact.test.ts` asserts this list matches the token source exactly.
 */
/* eslint-disable lingui/no-unlocalized-strings -- token/config identifiers (mirroring sound.tokens.json's own keys), never rendered copy. */
export const SOUND_CUE_IDS = [
  'thud.heavy',
  'thud.soft',
  'slap',
  'peel',
  'whoosh',
  'tick',
  'snap',
  'success',
  'warning',
  'error',
  'vote',
  'bell',
  'holdRamp',
  'sos',
  'alarm',
  'crack',
  'pop',
  'chirp',
  'flap',
  'printer',
  'scanner',
  'shutter',
  'pen',
  'page',
  'envelope',
  'music.tokek',
  'music.pon',
  'music.lundi',
  'music.ajo',
  'music.sardi',
  'music.paco',
  'voice.tokek',
  'voice.pon',
  'voice.lundi',
  'voice.ajo',
  'voice.sardi',
  'voice.paco',
] as const;
/* eslint-enable lingui/no-unlocalized-strings */

export type SoundCueId = (typeof SOUND_CUE_IDS)[number];

/**
 * Maps a cue's `hapticIOS`/`hapticAndroid` description (docs/design-system.md §4) to an `expo-haptics`
 * call. `holdRamp`, `sos` and `alarm`'s continuous/long/system patterns have no `expo-haptics`
 * equivalent — the `cp-haptics` native module (Core Haptics / `VibrationEffect.Composition`) is a
 * separate task in this phase; until it lands those three cues fire no haptic here.
 */
function hapticTriggerForDescription(description: string): (() => Promise<void>) | undefined {
  const normalized = description.toLowerCase();
  if (normalized.includes('selection')) return () => Haptics.selectionAsync();
  const isNotification = normalized.includes('notification');
  if (isNotification && normalized.includes('success')) {
    return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  if (isNotification && normalized.includes('warning')) {
    return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
  if (isNotification && normalized.includes('error')) {
    return () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
  if (Platform.OS === 'android' && normalized.includes('confirm')) {
    return () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
  }
  if (normalized.includes('heavy'))
    return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  if (normalized.includes('medium')) {
    return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
  if (normalized.includes('light'))
    return () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  return undefined;
}

/**
 * Fires the haptic mapped to `cueId` (docs/design-system.md §4 cue table). This is the haptics-only
 * slice of the feedback bus: SFX playback, category/quiet-hour muting and prefs are a later task in
 * this phase (`src/motion/feedback/*`, which will own the `impact` export from `src/motion/index.ts`
 * and re-export this mapping internally) — patterns call this now so their "impact = haptic (+ jolt)
 * in the same frame" behaviour is real today, not stubbed.
 */
export function impact(cueId: SoundCueId): void {
  const cue = tokens.sound.cue[cueId];
  if (!cue) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error(`motion: unknown sound cue "${cueId}"`);
  }
  const description = Platform.OS === 'ios' ? cue.hapticIOS : cue.hapticAndroid;
  if (!description) return;
  const trigger = hapticTriggerForDescription(description);
  trigger?.().catch(() => {
    // No haptics engine (simulator, hardware without a haptics motor): fail silently, never crash a gesture.
  });
}
