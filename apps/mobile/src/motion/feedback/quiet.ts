/**
 * "Quiet on the road" (docs/design-system.md §4): 22:00–07:00 device-local time, plus two external
 * context signals the location engine and notification settings push in (`feedback.setContextMute`,
 * see the phase's Architecture & contracts table). All three only mute SFX while the
 * `quietOnTheRoad` pref is on; `sos`/`alarm` bypass this entirely (`CueDefinition.bypassesQuiet`).
 */

const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;

export type QuietContext = 'temple' | 'quietHours';

const contextMutes: Record<QuietContext, boolean> = {
  temple: false,
  quietHours: false,
};

/** Set by the location engine (`'temple'`) or notification settings (`'quietHours'`) phases. */
export function setContextMute(context: QuietContext, muted: boolean): void {
  contextMutes[context] = muted;
}

export function isWithinQuietHoursWindow(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** True when SFX should be suppressed right now, given the user's "quiet on the road" preference. */
export function isQuietNow(quietOnTheRoadEnabled: boolean, now: Date = new Date()): boolean {
  if (!quietOnTheRoadEnabled) return false;
  return isWithinQuietHoursWindow(now) || contextMutes.quietHours || contextMutes.temple;
}

/** Test-only: MMKV mocks and prefs reset between test files, but this module's state does not. */
export function resetContextMutesForTests(): void {
  contextMutes.temple = false;
  contextMutes.quietHours = false;
}
