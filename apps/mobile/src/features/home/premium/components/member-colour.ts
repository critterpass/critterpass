/**
 * A crew member's stored colour (`yellow`, `blue/dashed`) as the premium accent their avatar wears.
 * Each person keeps one colour everywhere; an unknown or missing colour reads as the neutral member.
 */
import { parseMemberColour } from '@cp/domain';

import type { PremiumTheme } from '@/ui/premium';

export function memberAccent(theme: PremiumTheme, stored: string | null | undefined): string {
  const parsed = stored == null ? null : parseMemberColour(stored);
  switch (parsed?.accent) {
    case 'yellow':
      return theme.accent.sun;
    case 'orange':
      return theme.accent.tangerine;
    case 'blue':
      return theme.accent.sky;
    case 'pink':
      return theme.accent.pink;
    case 'green':
      return theme.accent.mint;
    case 'red':
      return theme.accent.pink;
    case 'cream':
    case undefined:
      return theme.accent.neutral;
  }
}
