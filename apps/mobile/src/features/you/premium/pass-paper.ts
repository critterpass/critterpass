/**
 * The passport paper the profile and Edit profile are printed on: the paper, its guilloche and
 * the inks the design uses on it. Paper stays light in dark mode (it is a document), toned down so
 * it does not glare off a dark page.
 */
import { memberColourForSlot, type GuideColour } from '@cp/domain';

import type { PremiumTheme } from '@/ui/premium';

/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- printed inks the premium tokens do not carry */
export const PASS_PAPER = {
  ink: '#17142a',
  label: '#5d564b',
  faint: '#9a917e',
  mrz: '#b3a993',
  rule: 'rgba(23,20,42,.14)',
  /** The paper on a dark page: the same warm sheet in dimmer light. */
  paperDim: '#e6dfcc',
} as const;
/* eslint-enable critterpass/no-literal-style, lingui/no-unlocalized-strings */

/** The passport paper for the theme's appearance. */
export function paperOf(theme: PremiumTheme): string {
  return theme.scheme === 'dark' ? PASS_PAPER.paperDim : theme.accent.paper;
}

/** The passport's printed mono sizes: a field label and the page header. */
export const PASS_PAPER_TYPE = { label: 8.5, header: 9.5 } as const;

/** The crew accent a member's join order gives them, as the premium accent. */
export function memberAccent(theme: PremiumTheme, joinIndex: number): string {
  const accent: GuideColour = memberColourForSlot(Math.max(0, joinIndex) % 16).accent;
  const map: Readonly<Record<GuideColour, string>> = {
    yellow: theme.accent.sun,
    orange: theme.accent.tangerine,
    blue: theme.accent.sky,
    pink: theme.accent.pink,
    green: theme.accent.mint,
    cream: theme.accent.neutral,
    red: theme.accent.pink,
  };
  return map[accent];
}
