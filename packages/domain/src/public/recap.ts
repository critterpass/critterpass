/**
 * A trip recap as the web shows it to a stranger holding its link (docs/api-contracts.md §5.6
 * `GET /v1/public/recap/{token}`, docs/product-decisions.md "Recap links"): where and when in the
 * roughest terms, how far the crew went, the catalogue places on its trail and the first names of
 * the travellers who have not hidden themselves. Never money, photos, awards, chat, exact dates,
 * places the crew typed in itself, stays, last names or anyone's id.
 */
import { z } from 'zod';

/** The most places the page lists. */
export const PUBLIC_RECAP_PLACES = 12;

/** Place categories a public recap never names: where the crew slept, and clinics. */
export const PUBLIC_RECAP_HIDDEN_CATEGORIES = ['stay', 'health'] as const;

export const publicRecapSchema = z.object({
  kind: z.literal('recap'),
  /** The recap's id: how the app tells a traveller's own recap from someone else's. */
  recap_id: z.uuid(),
  destination_name: z.string().nullable(),
  travel_month: z.number().int().min(1).max(12).nullable(),
  travel_year: z.number().int().nullable(),
  days: z.number().int().positive().nullable(),
  travellers: z.number().int().positive().nullable(),
  /** First names only, of travellers still in the crew who have not hidden themselves. */
  crew_names: z.array(z.string()).max(32),
  distance_m: z.number().int().nonnegative().nullable(),
  /** True when any part of the distance is a straight-line estimate. */
  distance_estimated: z.boolean(),
  places_count: z.number().int().nonnegative(),
  places: z
    .array(z.object({ name: z.string(), category: z.string().nullable() }))
    .max(PUBLIC_RECAP_PLACES),
  critters_found: z.number().int().nonnegative().nullable(),
  new_critters: z.number().int().nonnegative().nullable(),
});
export type PublicRecap = z.infer<typeof publicRecapSchema>;
