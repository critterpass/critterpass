/**
 * The destination guide's read (`/v1/explore/destinations/{id}`): month curve, FX chip, the fares
 * from each crew member's home airport for a month (in the viewer's currency, each with when it
 * was seen) and the first-timer picks. The last good answer is kept, so the page draws offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { exploreDestinationSchema, type ExploreDestinationWire } from '@cp/domain';

import type { Classification } from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';
import { query, useTravelRead } from '@/data/travel-data/use-travel-read';

export interface ExploreDestinationInput {
  /** Destination id or slug; null reads nothing. */
  readonly destination: string | null;
  readonly tripId?: string | undefined;
  /** `YYYY-MM`; the server prices two months out when absent. */
  readonly month?: string | undefined;
}

export function exploreDestinationPath(input: ExploreDestinationInput): string | null {
  if (input.destination === null || input.destination === '') return null;
  return `/v1/explore/destinations/${encodeURIComponent(input.destination)}${query({
    trip_id: input.tripId,
    month: input.month,
  })}`;
}

function classify(data: ExploreDestinationWire): Classification {
  const seen = data.fares.flatMap((fare) => (fare.seen_at === null ? [] : [fare.seen_at]));
  return {
    status: 'ok',
    seenAt: seen.length === 0 ? null : seen.reduce((a, b) => (a > b ? a : b)),
  };
}

export function useExploreDestination(
  input: ExploreDestinationInput,
): ReadState<ExploreDestinationWire> {
  return useTravelRead({
    path: exploreDestinationPath(input),
    schema: exploreDestinationSchema,
    classify,
  });
}
