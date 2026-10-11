/**
 * The one colour each person keeps everywhere (foundations-spec §2): their crew colour when the
 * crew has one stored, else by join order (sun, pink, sky, mint, tangerine, then the neutral).
 */
import { premium } from '@cp/design-tokens';

const BY_ORDER = [
  premium.accent.sun,
  premium.accent.pink,
  premium.accent.sky,
  premium.accent.mint,
  premium.accent.tangerine,
  premium.accent.neutral,
] as const;

const BY_NAME: Readonly<Record<string, string>> = {
  yellow: premium.accent.sun,
  sun: premium.accent.sun,
  pink: premium.accent.pink,
  red: premium.accent.pink,
  blue: premium.accent.sky,
  sky: premium.accent.sky,
  green: premium.accent.mint,
  mint: premium.accent.mint,
  orange: premium.accent.tangerine,
  tangerine: premium.accent.tangerine,
  cream: premium.accent.neutral,
};

export function crewAccent(joinIndex: number, stored?: string | null): string {
  if (stored !== null && stored !== undefined) {
    const named = BY_NAME[stored];
    if (named !== undefined) return named;
  }
  return (
    BY_ORDER[((joinIndex % BY_ORDER.length) + BY_ORDER.length) % BY_ORDER.length] ??
    premium.accent.neutral
  );
}
