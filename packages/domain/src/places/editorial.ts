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

export const editorialOverlaySchema = z
  .object({
    tips: z.array(z.string().min(1)).optional(),
    photos: z.array(editorialPhotoSchema).optional(),
    must_see: z.boolean().optional(),
  })
  .strict();

export type EditorialOverlay = z.infer<typeof editorialOverlaySchema>;

export const EMPTY_EDITORIAL_OVERLAY: EditorialOverlay = {};
