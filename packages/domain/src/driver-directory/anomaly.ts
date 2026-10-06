/**
 * Rating-ring check: one account rating the same listed driver on several trips, each time from a
 * crew that was new when the trip ended, is how a driver would rate himself. The check only raises
 * a flag with its evidence; ops decide.
 */

export interface ListingRatingRow {
  readonly user_id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  /** Days between the crew's creation and the rating. */
  readonly crew_age_days: number;
}

export interface RatingRingEvidence {
  readonly user_id: string;
  readonly trips: readonly string[];
  readonly crews: readonly string[];
}

/** A crew this young at rating time counts as new. */
export const NEW_CREW_MAX_AGE_DAYS = 45;
/** Ratings on this many trips from new crews raise the flag. */
export const RATING_RING_MIN_TRIPS = 2;

export function detectRatingRings(rows: readonly ListingRatingRow[]): RatingRingEvidence[] {
  const byUser = new Map<string, { trips: Set<string>; crews: Set<string> }>();
  for (const row of rows) {
    if (row.crew_age_days > NEW_CREW_MAX_AGE_DAYS) continue;
    const entry = byUser.get(row.user_id) ?? { trips: new Set<string>(), crews: new Set<string>() };
    entry.trips.add(row.trip_id);
    entry.crews.add(row.crew_id);
    byUser.set(row.user_id, entry);
  }
  const rings: RatingRingEvidence[] = [];
  for (const [user, entry] of byUser) {
    if (entry.trips.size >= RATING_RING_MIN_TRIPS && entry.crews.size >= RATING_RING_MIN_TRIPS) {
      rings.push({ user_id: user, trips: [...entry.trips].sort(), crews: [...entry.crews].sort() });
    }
  }
  return rings.sort((a, b) => (a.user_id < b.user_id ? -1 : 1));
}
