import { t } from '@lingui/core/macro';

import { tokens } from '@cp/design-tokens';

import { Text } from '../text/Text';
import type { TextVariant } from '../text/Text';

/** A no-break space: the tier glyph never wraps away from its word. */
const GLUE = '\u00A0';

export type Tier = 'common' | 'rare' | 'epic' | 'legendary';

export const TIERS: readonly Tier[] = ['common', 'rare', 'epic', 'legendary'];

export function tierWord(tier: Tier): string {
  switch (tier) {
    case 'common':
      return t({ id: 'common.critter.tierCommon', message: 'Common' });
    case 'rare':
      return t({ id: 'common.critter.tierRare', message: 'Rare' });
    case 'epic':
      return t({ id: 'common.critter.tierEpic', message: 'Epic' });
    case 'legendary':
      return t({ id: 'common.critter.tierLegendary', message: 'Legendary' });
  }
}

export const tierColor = (tier: Tier): string => tokens.tier[tier].color;

/** Tier shown as glyph + word in the tier colour, never colour alone ("◆ Rare"). */
export function TierWord({
  tier,
  suffix,
  variant = 'label',
  color,
  glyph = true,
  fit = false,
}: {
  readonly tier: Tier;
  /** Appended after a middle dot ("Water temples"). */
  readonly suffix?: string;
  readonly variant?: TextVariant;
  readonly color?: string;
  /** Off where the word sits alone in a narrow cell, as the form selector (3l-3) sets it. */
  readonly glyph?: boolean;
  /** Keeps the word on one line in a narrow cell, shrinking a long one ("HUYỀN THOẠI"). */
  readonly fit?: boolean;
}) {
  const word = tierWord(tier);
  return (
    <Text
      variant={variant}
      color={color ?? tierColor(tier)}
      {...(fit ? { autoFit: true, numberOfLines: 1 } : {})}
    >
      {`${glyph ? `${tokens.tier[tier].glyph}${GLUE}` : ''}${word}${suffix ? ` · ${suffix}` : ''}`}
    </Text>
  );
}

/** "Rare, water temples" — the spoken tier line. */
export function tierLine(tier: Tier, suffix?: string): string {
  return [tierWord(tier), suffix].filter(Boolean).join(', ');
}
