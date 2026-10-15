/**
 * What travel blogs say about one destination, as the researchers wrote it: the itinerary file
 * (`itineraries/<slug>.json`: areas, the consensus days of a first visit) and the places file
 * (`places/<slug>.jsonl`: area, best times, taste tags, prominence, blog count, meal role). The
 * benchmark only reads the fields it scores on; anything else in the files is ignored.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const placeSchema = z.object({
  name_en: z.string().min(1),
  name_local: z.string().nullish(),
  category: z.string().default('other'),
  lat: z.number(),
  lng: z.number(),
  area: z.string().nullish(),
  best_times: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  prominence: z.string().nullish(),
  essential_rank: z.number().int().nullish(),
  blog_count: z.number().int().nullish(),
  meal_role: z.enum(['meal', 'light']).nullish(),
});

const itinerarySchema = z.object({
  ideal_days: z.object({ min: z.number().int(), max: z.number().int() }).optional(),
  areas: z
    .array(z.object({ name: z.string(), places: z.array(z.string()).default([]) }))
    .default([]),
  consensus_days: z.array(
    z.object({
      day: z.number().int(),
      theme_en: z.string().default(''),
      areas: z.array(z.string()).default([]),
      stops: z.array(z.string()),
      source_count: z.number().int().default(0),
    }),
  ),
});

export type ReferencePlace = z.infer<typeof placeSchema> & { readonly index: number };
export type ConsensusDay = z.infer<typeof itinerarySchema>['consensus_days'][number];

export interface Reference {
  readonly slug: string;
  readonly places: readonly ReferencePlace[];
  readonly days: readonly ConsensusDay[];
  readonly areas: readonly string[];
}

/** A place blogs agree on: one a first visit is built around, read by 3+ pages, or on a consensus day. */
export function consensusPlaces(reference: Reference): ReferencePlace[] {
  const onDays = new Set(reference.days.flatMap((day) => day.stops));
  return reference.places.filter(
    (place) =>
      (place.essential_rank ?? null) !== null ||
      (place.blog_count ?? 0) >= 3 ||
      onDays.has(place.name_en),
  );
}

/** Reads a destination's files from the curated folder; null when its itinerary is not written yet. */
export function readReference(root: string, slug: string): Reference | null {
  let itineraryText: string;
  let placesText: string;
  try {
    itineraryText = readFileSync(join(root, 'itineraries', `${slug}.json`), 'utf8');
    placesText = readFileSync(join(root, 'places', `${slug}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const itinerary = itinerarySchema.parse(JSON.parse(itineraryText));
  const places = placesText
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line, index) => {
      const parsed = placeSchema.safeParse(JSON.parse(line));
      return parsed.success ? [{ ...parsed.data, index }] : [];
    });
  return {
    slug,
    places,
    days: itinerary.consensus_days,
    areas: itinerary.areas.map((area) => area.name),
  };
}
