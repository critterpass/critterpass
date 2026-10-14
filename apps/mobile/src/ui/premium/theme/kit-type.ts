/**
 * The app's type scale: the shared premium tokens plus the chip's size. The shared package also
 * feeds the widgets and notification surfaces compiled into each native build, so the app's own
 * additions live here and reach phones with an update.
 */
import { premium } from '@cp/design-tokens';
import type { PremiumTypeStyle } from '@cp/design-tokens';

const tokens = premium.type;

export const kitType = {
  ...tokens,
  /** Filter and choice chips: 13.5/600 (the journeys' chip rows). */
  chip: { ...tokens.segment, size: 13.5 },
} as const satisfies Record<string, PremiumTypeStyle>;

export type PremiumTypeName = keyof typeof kitType;
