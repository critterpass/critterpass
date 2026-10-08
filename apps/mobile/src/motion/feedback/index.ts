// `apps/mobile/modules/cp-haptics` is this phase's own native module (plan §"Architecture &
// contracts"); `tools/lint/boundaries.js` (owned by an earlier phase) does not yet classify
// `apps/mobile/modules/*` as an importable layer from `mobile-motion` — same class of pre-existing
// gap `apps/mobile/src/lib/i18n/set-locale.ts` already documents for `@cp/i18n`.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { play as playCpHaptic } from '../../../modules/cp-haptics';
import { impact as fireHaptic, type SoundCueId } from '../impact';
import { cueFor } from './cues';
import { getFeedbackPrefsSnapshot } from './prefs';
import { isQuietNow, setContextMute } from './quiet';
import { playCue } from './sfx-pool';

/** How many cues have been asked for so far, muted or not: see `withTapFeedback`. */
let emissions = 0;

/**
 * The feedback bus (docs/design-system.md §4 / docs/code-standards.md §7): one call fires the
 * token-mapped haptic and, where a cue has an SFX asset, its sound — respecting the haptics toggle,
 * SFX category toggles, and quiet-on-the-road/temple mute (bypassed by `sos`/`alarm`). Visual jolts
 * are the caller's own side effect (`patterns/shared.ts`'s `triggerImpact` fires both together so a
 * pattern's impact frame stays "visual + jolt + haptic + SFX", per choreography rule 3); `holdRamp`,
 * `sos` and continuous haptic patterns are `cp-haptics`' scope, not this function's.
 *
 * Doc delta (plan's open question 1): design-system §4 names this `impact(cueId)`, code-standards §7
 * names it `feedback.emit`. Both are exported — `feedback.emit` is an alias of `impact` — until the
 * docs are reconciled.
 */
export function impact(cueId: SoundCueId): void {
  emissions += 1;
  const cue = cueFor(cueId);
  const prefs = getFeedbackPrefsSnapshot();

  if (prefs.hapticsEnabled) {
    // `sos`'s "long continuous pattern" has no `expo-haptics` equivalent — cp-haptics (T6) plays it;
    // `holdRamp` stays continuous-only, driven directly by `gestures/hold-fill.ts`'s `ramp.*`, never by
    // a discrete `impact()` call.
    if (cueId === 'sos') playCpHaptic('sos');
    else fireHaptic(cueId);
  }

  if (cue.kind !== 'sfx' && cue.kind !== 'ambient') return;
  if (!cue.sfxAsset) return;
  if (
    (cue.category === 'stickers-and-stamps' || cue.category === 'critter-voices') &&
    !prefs.categoryEnabled[cue.category]
  ) {
    return;
  }
  if (!cue.bypassesQuiet && isQuietNow(prefs.quietOnTheRoad)) return;
  playCue(cueId, prefs.effectsVolume);
}

/**
 * Runs a shared control's tap handler, then fires the control's own cue, unless the handler fired
 * a cue itself: a screen that already answers the tap with its own feedback is never doubled.
 */
export function withTapFeedback(cueId: SoundCueId, handler: () => void): void {
  const before = emissions;
  handler();
  if (emissions === before) impact(cueId);
}

export const feedback = { emit: impact, setContextMute };

export { CUES, cueFor, TOGGLEABLE_SFX_CATEGORIES } from './cues';
export type { CueDefinition, CueKind, CueCategory, ToggleableSfxCategory } from './cues';
export {
  acquirePlaybackSession,
  currentAudioSessionCategory,
  resetAudioSessionForTests,
} from './audio-session';
export type { AudioSessionCategory } from './audio-session';
export { getFeedbackPrefsSnapshot, useFeedbackPrefs } from './prefs';
export type { FeedbackPrefsControls, FeedbackPrefsSnapshot } from './prefs';
export {
  isQuietNow,
  isWithinQuietHoursWindow,
  resetContextMutesForTests,
  setContextMute,
} from './quiet';
export type { QuietContext } from './quiet';
export { preloadAllSfx, resetSfxPoolForTests, SFX_ASSET_MODULES } from './sfx-pool';
