/**
 * The guide of a destination, for the local queries behind screens that have no trip to ask
 * (Explore, a place page, a vote): the guide of the destination's own critter while guides go by
 * city, else what the query chose before (its place's guide). A trip's own guide is never chosen
 * here: it is `trips.guide_id`, set by the server.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useContext, useEffect } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  guidesPerCity,
  useGuidesPerCity as useSwitch,
  useGuideRowsRevision,
} from '@/lib/navigation/active-guide';

import { feedGuides } from './feed';

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

export { guidesPerCity };

/**
 * Whether guides go by city, for a screen that reads a destination's guide. It keeps the guides
 * feed running while the screen is up, so a page opened straight from a link (no tab bar under it)
 * still learns the switch and the city guides' rows, and it renders again when those rows arrive.
 */
export function useGuidesPerCity(): boolean {
  const db = useContext(LocalFirstContext)?.db ?? null;
  useEffect(() => (db === null ? undefined : feedGuides(db)), [db]);
  useGuideRowsRevision();
  return useSwitch();
}
