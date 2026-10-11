/**
 * A seated member's colour where the row carries none: the crew accents in seat order, so each
 * person keeps one colour across a page.
 */
import type { PremiumTheme } from '@/ui/premium';

export function seatColour(t: PremiumTheme, index: number): string {
  const order = [
    t.accent.sun,
    t.accent.pink,
    t.accent.sky,
    t.accent.mint,
    t.accent.tangerine,
    t.accent.neutral,
  ];
  return order[index % order.length] ?? t.accent.sun;
}
