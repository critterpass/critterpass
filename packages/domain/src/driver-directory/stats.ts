/**
 * A listing's stats (the heart line and the directory order): one combined answer per crew per
 * trip, counted by verdict, plus the trips he drove crews on and the tags crews agreed on most.
 * The api refreshes them after every answer and claim; the worker refreshes all of them nightly.
 * Held answers (ops review) never count.
 */
import { combineCrewAnswer, type DriverTag, type DriverVerdict } from './rating';

export interface ListingRatingVote {
  readonly crew_id: string;
  readonly trip_id: string;
  readonly verdict: DriverVerdict;
  readonly tags: readonly DriverTag[];
}

export interface ListingStats {
  readonly crews_rated: number;
  readonly crews_loved: number;
  readonly crews_fine: number;
  readonly crews_not_again: number;
  readonly trips: number;
  readonly top_tags: readonly DriverTag[];
}

const TOP_TAGS = 3;

export function computeListingStats(votes: readonly ListingRatingVote[]): ListingStats {
  const byCrewTrip = new Map<string, ListingRatingVote[]>();
  for (const vote of votes) {
    const key = `${vote.crew_id}:${vote.trip_id}`;
    const group = byCrewTrip.get(key) ?? [];
    group.push(vote);
    byCrewTrip.set(key, group);
  }
  const counts: Record<DriverVerdict, number> = { loved: 0, fine: 0, not_again: 0 };
  const tagCounts = new Map<DriverTag, number>();
  const trips = new Set<string>();
  for (const group of byCrewTrip.values()) {
    const answer = combineCrewAnswer(group);
    if (answer === null) continue;
    counts[answer.verdict] += 1;
    for (const tag of answer.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    trips.add(group[0]?.trip_id ?? '');
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAGS)
    .map(([tag]) => tag);
  return {
    crews_rated: byCrewTrip.size,
    crews_loved: counts.loved,
    crews_fine: counts.fine,
    crews_not_again: counts.not_again,
    trips: trips.size,
    top_tags: topTags,
  };
}

/** `$1` = listing id. */
export const LISTING_RATING_VOTES_SQL = `SELECT crew_id, trip_id, verdict, tags FROM driver_ratings
  WHERE listing_id = $1 AND status = 'visible'`;

/** `$1` = listing id, then the stats in `ListingStats` order. */
export const UPSERT_LISTING_STATS_SQL = `INSERT INTO driver_listing_stats
    (listing_id, crews_rated, crews_loved, crews_fine, crews_not_again, trips, top_tags, updated_at)
  SELECT $1, $2, $3, $4, $5, $6, $7, now() WHERE EXISTS (SELECT 1 FROM driver_listings WHERE id = $1)
  ON CONFLICT (listing_id) DO UPDATE SET crews_rated = $2, crews_loved = $3, crews_fine = $4,
    crews_not_again = $5, trips = $6, top_tags = $7, updated_at = now()`;

export function listingStatsParams(listingId: string, stats: ListingStats): unknown[] {
  return [
    listingId,
    stats.crews_rated,
    stats.crews_loved,
    stats.crews_fine,
    stats.crews_not_again,
    stats.trips,
    stats.top_tags,
  ];
}
