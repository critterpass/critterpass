/** Each expense category's colour sticker and tint on the premium money screens (7.21, 7.23). */
import type { PremiumPalette } from '@cp/design-tokens';
import type { ExpenseCategory } from '@cp/domain';

import type { StickerIconName } from '@/ui/premium';

type Tint = keyof PremiumPalette['status'];

const LOOK: Readonly<
  Record<ExpenseCategory, { readonly icon: StickerIconName; readonly tint: Tint }>
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
