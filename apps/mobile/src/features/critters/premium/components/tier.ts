/** Tier colours of the premium design: the label colour, and the tint behind a tier's art. */
import type { Rarity } from '@cp/critter-art';

import type { CritterTier, PremiumTheme } from '@/ui/premium';

/** The kit's tier word for a form's rarity (legendary reads as the gold "locked" tier). */
export function kitTier(rarity: Rarity): CritterTier {
  return rarity;
}

export function tierInk(t: PremiumTheme, rarity: Rarity): string {
  switch (rarity) {
    case 'common':
      return t.color.tier.common;
    case 'rare':
      return t.color.tier.rare;
    case 'epic':
      return t.color.tier.epic;
    case 'legendary':
      return t.color.tier.locked;
  }
}

/** The accent a tier's tag is drawn on (rare sky, epic pink, legendary sun, common mint). */
export function tierAccent(t: PremiumTheme, rarity: Rarity): string {
  switch (rarity) {
    case 'common':
      return t.accent.mint;
    case 'rare':
      return t.accent.sky;
    case 'epic':
      return t.accent.pink;
    case 'legendary':
      return t.accent.sun;
  }
}

/** The "?" disc of a locked form: epic pink tint, legendary sun tint, others plain control. */
export function lockedDisc(t: PremiumTheme, rarity: Rarity): { bg: string; text: string } {
  if (rarity === 'epic') return t.color.status.voteOpen;
  if (rarity === 'legendary') return t.color.status.maybe;
  return { bg: t.color.control, text: t.color.muted };
}
