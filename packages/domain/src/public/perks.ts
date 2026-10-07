/**
 * The perk catalogue as the website reads it (docs/api-contracts.md §5.6 `GET /v1/catalog/perks`):
 * the switched-on perk lines in display order. Catalogue data only: no prices (the stores set and
 * localise them) and nothing about any user.
 */
import { z } from 'zod';

export const PUBLIC_PERK_TIERS = ['pass_plus', 'boost', 'ftf', 'crew_year'] as const;
export type PublicPerkTier = (typeof PUBLIC_PERK_TIERS)[number];

export const publicPerkSchema = z.object({
  key: z.string().min(1),
  tier: z.enum(PUBLIC_PERK_TIERS),
  /** Names the words a client shows for the perk; a client without words for it leaves it out. */
  copy_key: z.string().min(1),
  sort: z.number().int(),
});
export type PublicPerk = z.infer<typeof publicPerkSchema>;

export const publicPerksSchema = z.object({ perks: z.array(publicPerkSchema).max(200) });
export type PublicPerks = z.infer<typeof publicPerksSchema>;
