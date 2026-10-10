import { t } from '@lingui/core/macro';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';

export type CritterTier = 'common' | 'rare' | 'epic' | 'legendary' | 'locked';

/** Tier glyphs: symbols beside the translated word. */
const GLYPH: Record<CritterTier, string> = {
  common: '●',
  rare: '◆',
  epic: '★',
  legendary: '✦',
  locked: '✦',
};

/** A no-break space: the glyph never wraps away from its word. */
const GLUE = '\u00A0';

export function tierWord(tier: CritterTier): string {
  switch (tier) {
    case 'common':
      return t({ id: 'common.critter.tierCommon', message: 'Common' });
    case 'rare':
      return t({ id: 'common.critter.tierRare', message: 'Rare' });
    case 'epic':
      return t({ id: 'common.critter.tierEpic', message: 'Epic' });
    case 'legendary':
      return t({ id: 'common.critter.tierLegendary', message: 'Legendary' });
    case 'locked':
      return t({ id: 'common.critter.tierLocked', message: 'Locked' });
  }
}

/** Legendary shares the locked gold: both are the rare finds the design marks with ✦. */
function tierColour(theme: PremiumTheme, tier: CritterTier): string {
  if (tier === 'legendary') return theme.color.tier.locked;
  return theme.color.tier[tier];
}

export interface TierLabelProps {
  readonly tier: CritterTier;
  readonly testID?: string;
}

/** A critter's tier as glyph + word in the tier colour (11/700), never colour alone. */
export function TierLabel({ tier, testID }: TierLabelProps) {
  const theme = usePremiumTheme();
  return (
    <Text testID={testID} variant="tier" color={tierColour(theme, tier)} numberOfLines={1}>
      {`${GLYPH[tier]}${GLUE}${tierWord(tier)}`}
    </Text>
  );
}
