/**
 * What stops a crewmate's SOS from reaching this Android phone loudly, in the order to fix it:
 * notifications off (nothing arrives at all), then Do Not Disturb access (the SOS channel may
 * ring through it only once the person allows it), then full-screen alerts (without them an SOS
 * on a locked phone is a banner). The system decides which limits exist on this Android version;
 * iOS and phones without the surfaces module have none of these rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire ids from the native module, never shown. */

export type SosAccessRow = 'notifications' | 'dnd_access' | 'full_screen_intent';

/** The part of the surfaces module's permission state an SOS depends on. */
export interface SosSurfaceState {
  readonly notifications: boolean;
  readonly fullScreenIntent: boolean;
  readonly sosPath: 'bypass_dnd' | 'high_respects_dnd' | 'in_app_only';
  /** The settings pages this Android version has. */
  readonly banners: readonly string[];
}

export function sosAccessRows(state: SosSurfaceState | null): readonly SosAccessRow[] {
  if (state === null) return [];
  if (!state.notifications) return ['notifications'];
  const rows: SosAccessRow[] = [];
  if (state.sosPath !== 'bypass_dnd' && state.banners.includes('dnd_access')) {
    rows.push('dnd_access');
  }
  if (!state.fullScreenIntent && state.banners.includes('full_screen_intent')) {
    rows.push('full_screen_intent');
  }
  return rows;
}
