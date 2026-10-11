/**
 * A crew member's colour in the premium design: each person keeps one accent everywhere (sun,
 * pink, sky, mint, tangerine, then the neutral member colour). The stored crew colour name wins;
 * without one the colour follows join order.
 */
import { premium } from '@cp/design-tokens';

const BY_NAME: Readonly<Record<string, string>> = {
  yellow: premium.accent.sun,
  pink: premium.accent.pink,
  blue: premium.accent.sky,
  green: premium.accent.mint,
  orange: premium.accent.tangerine,
  cream: premium.accent.neutral,
};

const IN_ORDER = [
  premium.accent.sun,
  premium.accent.pink,
  premium.accent.sky,
  premium.accent.mint,
  premium.accent.tangerine,
  premium.accent.neutral,
] as const;

export function crewAccent(colour: string | null | undefined, joinIndex: number): string {
  const named = colour === null || colour === undefined ? undefined : BY_NAME[colour];
  if (named !== undefined) return named;
  const index = joinIndex < 0 ? 0 : joinIndex % IN_ORDER.length;
  return IN_ORDER[index] ?? premium.accent.neutral;
}
