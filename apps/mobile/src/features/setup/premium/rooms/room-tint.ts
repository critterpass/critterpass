/** The bed tile tints rooms take in turn: sun, rain, mint (7.07, 7.08). */
import type { usePremiumTheme } from '@/ui/premium';

type Theme = ReturnType<typeof usePremiumTheme>;

export function bedTint(th: Theme, index: number): { readonly bg: string; readonly text: string } {
  const tints = [th.color.banner.guide, th.color.status.rain, th.color.status.booked] as const;
  return tints[index % tints.length] ?? th.color.status.rain;
}
