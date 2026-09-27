/**
 * Fares for the crew's airports into one destination and month (`/v1/fares`): per-origin prices
 * with their own `ok`/`stale`/`missing` state ("~$X (seen 3h ago)", "no recent price", "from KUL"),
 * and an overall state that is `missing` when no origin has any price.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import type { Classification } from './client';
import type { ReadState } from './freshness';
import { query, useTravelRead } from './use-travel-read';
import { faresResponseSchema, type FareViewWire as FareView, type FaresResponse } from '@cp/domain';

export interface UseFaresInput {
  readonly origins: readonly string[];
  /** Destination id, slug or airport code. */
  readonly dest: string | null;
  /** `YYYY-MM`. */
  readonly month: string | null;
}

function latestSeen(fares: readonly FareView[]): string | null {
  const seen = fares.flatMap((fare) => (fare.seen_at === null ? [] : [fare.seen_at]));
  return seen.length === 0 ? null : seen.reduce((a, b) => (a > b ? a : b));
}

export function classifyFares(data: FaresResponse): Classification {
  const fresh = data.fares.filter((fare) => fare.state === 'ok');
  if (fresh.length > 0) return { status: 'ok', seenAt: latestSeen(fresh) };
  const stale = data.fares.filter((fare) => fare.state === 'stale');
  if (stale.length > 0) return { status: 'stale', seenAt: latestSeen(stale), reason: 'old' };
  return { status: 'missing' };
}

export function faresPath(input: UseFaresInput): string | null {
  if (input.dest === null || input.month === null || input.origins.length === 0) return null;
  return `/v1/fares${query({ origins: input.origins.join(','), dest: input.dest, month: input.month })}`;
}

export function useFares(input: UseFaresInput): ReadState<FaresResponse> {
  return useTravelRead({
    path: faresPath(input),
    schema: faresResponseSchema,
    classify: classifyFares,
  });
}
