/**
 * The passport paper the profile and Edit profile are printed on: the paper, its guilloche and
 * the inks the design uses on it. Paper stays light in dark mode (it is a document).
 */
import { memberColourForSlot, type GuideColour } from '@cp/domain';

import type { PremiumTheme } from '@/ui/premium';

export const PASS_PAPER = {
  ink: '#17142a',
  label: '#5d564b',
  faint: '#9a917e',
  mrz: '#b3a993',
  rule: 'rgba(23,20,42,.14)',
} as const;

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
