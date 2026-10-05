/**
 * The editorial overlay a curated POI (`pois.editorial jsonb`) carries on top of its conflated
 * FSQ OS Places / Overture record: tips, licensed photos and a must-see flag authored by the content
 * factory. `name_local` and `tags` are their own `pois` columns, not part of this blob; this is only
 * the remaining, less structured content.
 */
import { z } from 'zod';

export const editorialPhotoSchema = z
  .object({
    media_key: z.string().min(1),
    licence: z.string().min(1),
    credit: z.string().min(1),
  })
  .strict();

export type EditorialPhoto = z.infer<typeof editorialPhotoSchema>;

/** One KNOW BEFORE YOU GO line: a short title and, when it helps, a detail under it. */
export const placeKnowSchema = z
  .object({
    title: z.string().min(1).max(60),
    detail: z.string().min(1).max(90).optional(),
  })
  .strict();

export type PlaceKnow = z.infer<typeof placeKnowSchema>;

export const editorialOverlaySchema = z
  .object({
    tips: z.array(z.string().min(1)).optional(),
    photos: z.array(editorialPhotoSchema).optional(),
    must_see: z.boolean().optional(),
    /** One of the few must-sees a first visit is built around; set only with `must_see`. */
    essential: z.boolean().optional(),
    /** Content factory editorial, written from open data only. */
    why_go: z.string().min(1).optional(),
    best_time: z.string().min(1).optional(),
    time_needed_min: z.number().int().positive().optional(),
    crowd_hint: z.string().min(1).optional(),
    etiquette: z.string().min(1).optional(),
    /**
     * Place facts, each researched with a cited source and approved by an operator before it is
     * written here (the place facts kind of the content factory). A tile without one is omitted.
     */
    entry_short: z.string().min(1).max(12).optional(),
    dress_short: z.string().min(1).max(12).optional(),
    know_before: z.array(placeKnowSchema).max(5).optional(),
  })
  .strict();

export type EditorialOverlay = z.infer<typeof editorialOverlaySchema>;

export const EMPTY_EDITORIAL_OVERLAY: EditorialOverlay = {};

const OVERLAY_KEYS: ReadonlySet<string> = new Set(Object.keys(editorialOverlaySchema.shape));

/**
 * Reads a stored overlay (`pois.editorial`). A stored note is data we read, not input we
 * validate: a line stored as null counts as absent and a key this version does not know is
 * ignored, so neither an older publish nor a newer one takes a reader down. What remains is
 * parsed as `editorialOverlaySchema`, so a known line of the wrong type still fails.
 */
export function readEditorialOverlay(value: unknown): EditorialOverlay {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return editorialOverlaySchema.parse(value);
  return editorialOverlaySchema.parse(
    Object.fromEntries(
      Object.entries(value).filter(([key, line]) => OVERLAY_KEYS.has(key) && line !== null),
    ),
  );
}
