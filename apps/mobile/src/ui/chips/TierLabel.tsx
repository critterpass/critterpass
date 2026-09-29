import { t } from '@lingui/core/macro';

import { Text } from '../text/Text';
import type { TextVariant } from '../text/Text';
import { useTheme } from '../theme';

/** A no-break space: the tier glyph never wraps away from its word. */
const GLUE = '\u00A0';

export type Tier = 'common' | 'rare' | 'epic' | 'legendary';

export function tierWord(tier: Tier): string {
  switch (tier) {
    case 'common':
      return t({ id: 'common.tier.common', message: 'Common' });
    case 'rare':
      return t({ id: 'common.tier.rare', message: 'Rare' });
    case 'epic':
      return t({ id: 'common.tier.epic', message: 'Epic' });
    case 'legendary':
      return t({ id: 'common.tier.legendary', message: 'Legendary' });
  }
}

export interface TierLabelProps {
  readonly tier: Tier;
  /** Extra words after the tier ("Water temples only"). */
  readonly suffix?: string;
  /** @default 'label' */
  readonly variant?: TextVariant;
  readonly testID?: string;
}

/** Critter tier as glyph + word in the tier colour: tier is never shown by colour alone. */
export function TierLabel({ tier, suffix, variant = 'label', testID }: TierLabelProps) {
  const theme = useTheme();
  const token = theme.tier[tier];
  const word = tierWord(tier);
  const text = suffix ? `${word} · ${suffix}` : word;
  return (
    <Text testID={testID} variant={variant} color={token.color} accessibilityLabel={text}>
      {`${token.glyph}${GLUE}${text}`}
    </Text>
  );
}
