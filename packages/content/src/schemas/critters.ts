/**
 * `critters` release items: one per CritterDex entry. `art_params` is critter-art's render input
 * (unchanged from the design unless an IP rename forces a new look); the six guides are hand-drawn
 * kinds (`{k}`). Names travel in the release but are published to `critter_names` only, never to a
 * synced catalogue column: a critter's name stays server-side until the viewer finds it.
 */
import { artParamsSchema } from '@cp/critter-art';
import { z } from 'zod';

import { critterIdSchema, placeCodeSchema } from './common';

export const guideArtSchema = z.object({ k: z.string().min(1) }).strict();

export const critterItemSchema = z
  .object({
    id: critterIdSchema,
    no: z.number().int().min(1).max(999),
    set_code: placeCodeSchema,
    /** The city or spot the critter lives in (shown on locked slots instead of the name). */
    city: z.string().min(1),
    species: z.string().min(1),
    /** Display name in Latin script (romanised when the place writes in another script). */
    name: z.string().min(1).max(24),
    /** Native-script name when it differs from `name` (`ポン`); null when the place writes in Latin. */
    name_native: z.string().min(1).max(24).nullable(),
    art_params: z.union([artParamsSchema, guideArtSchema]),
    canonical_seed: z.number().int().min(0),
    /** Neutral one-liner for the dex detail, shown once found. */
    note: z.string().min(1).max(140),
  })
  .strict();
export type CritterItem = z.infer<typeof critterItemSchema>;
