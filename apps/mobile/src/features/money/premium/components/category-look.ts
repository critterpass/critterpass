/** Each expense category's line icon and tint on the premium money screens. */
import type { PremiumPalette } from '@cp/design-tokens';
import type { ExpenseCategory } from '@cp/domain';

import type { LineIconName } from '@/features/trip';

type Tint = keyof PremiumPalette['status'];

const LOOK: Readonly<
  Record<ExpenseCategory, { readonly icon: LineIconName; readonly tint: Tint }>
> = {
  stays: { icon: 'bed', tint: 'tangerine' },
  food: { icon: 'food', tint: 'voteOpen' },
  transit: { icon: 'car', tint: 'rain' },
  fun: { icon: 'star', tint: 'maybe' },
  other: { icon: 'wallet', tint: 'unopened' },
};

export function categoryLook(category: ExpenseCategory, palette: PremiumPalette) {
  const look = LOOK[category];
  const tint = palette.status[look.tint];
  return { icon: look.icon, bg: tint.bg, color: tint.text };
}
