/**
 * The guide of a destination, for the local queries behind screens that have no trip to ask
 * (Explore, a place page, a vote): the guide of the destination's own critter while guides go by
 * city, else what the query chose before (its place's guide). A trip's own guide is never chosen
 * here: it is `trips.guide_id`, set by the server.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { guidesPerCity, useGuidesPerCity } from '@/lib/navigation/active-guide';

/** The table the per-city expression reads, to add to a live query's tables. */
export const DESTINATION_GUIDE_TABLES: readonly string[] = ['guides'];

/**
 * An SQL expression for a destination's guide slug. `critterKey` is the destination's critter key
 * in the query (`d.critter_key`); `placeGuide` is the expression the query used before, which
 * still answers where the destination has no critter or its guide row has not synced.
 */
export function destinationGuideSql(
  perCity: boolean,
  critterKey: string,
  placeGuide: string,
): string {
  if (!perCity) return placeGuide;
  return `coalesce((SELECT cg.slug FROM guides cg WHERE cg.critter_key = ${critterKey}), ${placeGuide})`;
}

export { guidesPerCity, useGuidesPerCity };
