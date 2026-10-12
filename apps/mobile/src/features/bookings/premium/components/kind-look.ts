/**
 * How each booking kind looks in the premium wallet: its line icon and the status tint its tile
 * sits on (7.02, 1.06: flights sky, stays tangerine, boats mint, tickets pink).
 */
import type { BookingKind } from '@cp/domain';
import type { PremiumPalette } from '@cp/design-tokens';

import type { LineIconName } from '@/features/trip';

type Tint = keyof PremiumPalette['status'];

const LOOK: Readonly<Record<BookingKind, { readonly icon: LineIconName; readonly tint: Tint }>> = {
  flight: { icon: 'plane', tint: 'rain' },
  stay: { icon: 'bed', tint: 'tangerine' },
  boat: { icon: 'boat', tint: 'booked' },
  activity: { icon: 'star', tint: 'voteOpen' },
  transfer: { icon: 'car', tint: 'maybe' },
  car: { icon: 'car', tint: 'maybe' },
  rail: { icon: 'train', tint: 'rain' },
  other: { icon: 'receipt', tint: 'unopened' },
};

export function kindLook(kind: BookingKind, palette: PremiumPalette) {
  const look = LOOK[kind];
  const tint = palette.status[look.tint];
  return { icon: look.icon, bg: tint.bg, color: tint.text };
}
