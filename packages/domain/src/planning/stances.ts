/**
 * Where people stand on a place in a trip (docs/data-model.md §3.3 `place_stances`) and the places
 * a person hid (`place_hides`). A stance is an explicit, public ballot: the person chose WANT IT or
 * RATHER NOT and wrote their own words for the crew, so the crew sees who said it (the crew
 * visibility rules in docs/product-decisions.md). A stance is never derived from a swipe "no"
 * or a hidden place; hides stay private to their owner, like every passive signal.
 */
import { z } from 'zod';

export const PLACE_STANCES = ['want', 'rather_not'] as const;
export const placeStanceSchema = z.enum(PLACE_STANCES);
export type PlaceStance = z.infer<typeof placeStanceSchema>;

/** The longest note a stance may carry (the 7e-3 render's longest line is 39 characters). */
export const STANCE_NOTE_MAX = 140;
export const stanceNoteSchema = z.string().trim().min(1).max(STANCE_NOTE_MAX);

/** A `place_stances` row as it syncs to the trip's crew. */
export const placeStanceRowSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  poi_id: z.uuid(),
  user_id: z.uuid(),
  stance: placeStanceSchema,
  note: z.string().max(STANCE_NOTE_MAX).nullable(),
  updated_at: z.iso.datetime({ offset: true }),
});
export type PlaceStanceRow = z.infer<typeof placeStanceRowSchema>;

/** A `place_hides` row: synced to its owner only. */
export const placeHideRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  poi_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
});
export type PlaceHideRow = z.infer<typeof placeHideRowSchema>;
