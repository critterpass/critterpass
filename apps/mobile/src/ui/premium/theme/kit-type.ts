/**
 * The app's type scale: the shared premium tokens with the values the journeys (02–09) set where
 * they differ from the Foundations sample, plus the chip's size. The shared package also feeds the
 * widgets and notification surfaces compiled into each native build, so the app's own corrections
 * live here and reach phones with an update.
 *
 * - `caption` is 12.5/400 in every row subtitle and timestamp; the 12.5/500 sample is the only
 *   medium one.
 * - Display names on a page are 44/800 −0.045em; the 66 pt hero is the trip's own title.
 * - Borel's own line box is 2 em, so a 15 pt guide line stood 30 pt tall: the design sets the
 *   guide at 1.5 and its one-line name at 1.5 too. `Text` adds the top room the shorter box takes
 *   from Borel's tall ascenders and marks.
 */
import { premium } from '@cp/design-tokens';
import type { PremiumTypeStyle } from '@cp/design-tokens';

const tokens = premium.type;

export const kitType = {
  ...tokens,
  caption: { ...tokens.caption, weight: '400' },
  guide: { ...tokens.guide, lineHeight: 22.5 },
  guideName: { ...tokens.guideName, lineHeight: 18 },
  /** Filter and choice chips: 13.5/600 (the journeys' chip rows). */
  /** A page's display name under a photo or a moment (4.03 "Marrakech", 8.05 "Welcome to Bali"). */
  displayLarge: { ...tokens.hero, size: 44, tracking: -1.98, maxScale: tokens.display.maxScale },
  chip: { ...tokens.segment, size: 13.5 },
} as const satisfies Record<string, PremiumTypeStyle>;

export type PremiumTypeName = keyof typeof kitType;
