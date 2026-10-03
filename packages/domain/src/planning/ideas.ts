/**
 * Ideas: places the crew saved for a trip but has not put on a day (docs/data-model.md §3.3
 * `trip_ideas`). Each row carries its own display copy (name, category, position), so Ideas and
 * the trip map work offline even for an open-data place no phone holds a `pois` row for. A dropped
 * pin has no `poi_id`, only that copy. Hidden places and stances live in ./stances.ts.
 */
import { z } from 'zod';

import { poiCategorySchema } from '../places/categories';
import { storedFitSchema } from './fit';

/** How an idea reached the trip; an idea keeps every source that added a backer. */
export const IDEA_SOURCES = ['save', 'link', 'swipe', 'search', 'map', 'pin', 'guide'] as const;
export const ideaSourceSchema = z.enum(IDEA_SOURCES);
export type IdeaSource = z.infer<typeof ideaSourceSchema>;

export const IDEA_NAME_MAX = 120;

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** A place with no `pois` row: a dropped pin on an idea, or `plan_items.custom_place` on a stop. */
export const customPlaceSchema = z.strictObject({
  name: z.string().trim().min(1).max(IDEA_NAME_MAX),
  lat: latitude,
  lng: longitude,
});
export type CustomPlace = z.infer<typeof customPlaceSchema>;

/** A `trip_ideas` row as it syncs to the phone. */
export const tripIdeaSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  poi_id: z.uuid().nullable(),
  name: z.string().min(1).max(IDEA_NAME_MAX),
  name_local: z.string().max(IDEA_NAME_MAX).nullable(),
  category: poiCategorySchema,
  lat: latitude,
  lng: longitude,
  backer_ids: z.array(z.uuid()),
  sources: z.array(ideaSourceSchema).min(1),
  source_url: z.url().nullable(),
  fit: storedFitSchema.nullable(),
  fit_version_id: z.uuid().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  deleted_at: z.iso.datetime({ offset: true }).nullable(),
});
export type TripIdea = z.infer<typeof tripIdeaSchema>;
