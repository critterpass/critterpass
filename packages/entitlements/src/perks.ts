/**
 * Server-driven perk list filtering (docs/product-decisions.md: every perk ships at launch, but
 * `perk.enabled` stays server-driven so a partner-dependent or broken perk can be withdrawn from
 * copy without an app release). The `perks` table rows themselves are a separate DB schema; this is
 * the one place both server and client filter/sort them, over whatever shape that table hands in.
 */

export const PERK_TIERS = ['pass_plus', 'boost', 'ftf', 'crew_year'] as const;
export type PerkTier = (typeof PERK_TIERS)[number];

export interface Perk {
  readonly key: string;
  readonly tier: PerkTier;
  readonly copyKey: string;
  readonly enabled: boolean;
  readonly sort: number;
}

/** Enabled perks only, in display order — a client never renders a disabled perk, ever. */
export function enabledPerks(perks: readonly Perk[]): readonly Perk[] {
  return perks.filter((perk) => perk.enabled).toSorted((a, b) => a.sort - b.sort);
}
