/**
 * A member's stored crew colour (`yellow`, `blue/dashed`…) as the premium accent their avatar
 * wears; an unknown or missing colour wears the neutral member colour.
 */
import { parseMemberColour, type GuideColour } from '@cp/domain';

import type { PremiumTheme } from '@/ui/premium';

export function memberAccent(theme: PremiumTheme, stored: string | null): string {
  const accent = parseMemberColour(stored)?.accent ?? null;
  const map: Readonly<Record<GuideColour, string>> = {
    yellow: theme.accent.sun,
    orange: theme.accent.tangerine,
    blue: theme.accent.sky,
    pink: theme.accent.pink,
    green: theme.accent.mint,
    cream: theme.accent.neutral,
    red: theme.accent.pink,
  };
  return accent === null ? theme.accent.neutral : map[accent];
}
