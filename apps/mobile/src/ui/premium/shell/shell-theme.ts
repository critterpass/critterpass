/**
 * The few values the shell draws with that the premium token group does not carry yet: the guide
 * circle's yellow (Tabs.dc.html), the hold-to-confirm fill (4.55), the sheet scrim and the Material
 * bar height. Everything else comes from the kit's theme (`usePremiumTheme`).
 */
import { usePremiumTheme } from '..';

export interface ShellExtras {
  /** The guide circle's radial fill, centre to edge. */
  readonly guide: { readonly from: string; readonly mid: string; readonly to: string };
  /** The fill that grows across the hold-to-confirm pill. */
  readonly holdFill: string;
  /** The page behind the `+` → sheet morph dims to this. */
  readonly scrim: string;
  /** The ring around the guide circle. */
  readonly guideRing: string;
}

/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- shell colours the premium tokens do not carry yet */
const EXTRAS: Readonly<Record<'light' | 'dark', ShellExtras>> = {
  light: {
    guide: { from: '#fff3b8', mid: '#ffd84a', to: '#f2b92e' },
    holdFill: '#ffc2dc',
    scrim: 'rgba(0,0,0,.2)',
    guideRing: 'rgba(255,255,255,.95)',
  },
  dark: {
    guide: { from: '#fff3b8', mid: '#ffd84a', to: '#f2b92e' },
    holdFill: '#5a2440',
    scrim: 'rgba(0,0,0,.45)',
    guideRing: 'rgba(255,255,255,.2)',
  },
};
/* eslint-enable critterpass/no-literal-style, lingui/no-unlocalized-strings */

/** Sizes the shell needs beyond the premium size tokens (pt / dp). */
export const SHELL_SIZE = {
  /** Tokek's circle (Tabs.dc.html, phone 1.04). */
  guideCircle: 56,
  guideCircleBorder: 3,
  /** Tokek inside the circle. */
  guideCritter: 46,
  /** Material bottom navigation height, which the Android guide button floats above. */
  androidTabBar: 80,
  /** The Android guide button's margin from the bar and the screen edge. */
  androidFabMargin: 16,
} as const;

export function useShellExtras(): ShellExtras {
  return EXTRAS[usePremiumTheme().scheme];
}
