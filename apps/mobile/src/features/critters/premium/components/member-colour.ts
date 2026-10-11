/**
 * A crew member's colour as a premium accent: the stored member colour (`crew_members.colour`)
 * when there is one, else a stable pick from the name so a face keeps its colour on every screen.
 */
import { parseMemberColour } from '@cp/domain';
import { premium } from '@cp/design-tokens';

const BY_ACCENT: Readonly<Record<string, string>> = {
  yellow: premium.accent.sun,
  orange: premium.accent.tangerine,
  pink: premium.accent.pink,
  blue: premium.accent.sky,
  green: premium.accent.mint,
  cream: premium.accent.neutral,
};

const ORDER = [
  premium.accent.sun,
  premium.accent.pink,
  premium.accent.sky,
  premium.accent.mint,
  premium.accent.tangerine,
];

export function premiumMemberColour(name: string, stored: string | null = null): string {
  const parsed = parseMemberColour(stored);
  const fromStored = parsed === null ? undefined : BY_ACCENT[parsed.accent];
  if (fromStored !== undefined) return fromStored;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return ORDER[hash % ORDER.length] ?? premium.accent.sun;
}
