/**
 * The destination page's data (`/v1/destinations/{id}`): month curve (`curve: null` hides WHEN TO
 * GO and shows `best_months`), events, highlights, per-origin fares for the chosen month and the FX
 * chip, re-priced for the crew's airports.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import type { Classification } from './client';
import type { ReadState } from './freshness';
import { query, useTravelRead } from './use-travel-read';
import { destinationInsightsSchema, type DestinationInsights } from '@cp/domain';

export interface UseDestinationInsightsInput {
  /** Destination id, slug or airport code. */
  readonly destination: string | null;
  readonly origins?: readonly string[];
  readonly month?: string;
  readonly currency?: string;
}

export function classifyInsights(data: DestinationInsights): Classification {
  const seen = data.fares.flatMap((fare) =>
    fare.state === 'ok' && fare.seen_at !== null ? [fare.seen_at] : [],
  );
  return {
    status: 'ok',
    seenAt: seen.length === 0 ? null : seen.reduce((a, b) => (a > b ? a : b)),
  };
}

export function destinationInsightsPath(input: UseDestinationInsightsInput): string | null {
  if (input.destination === null) return null;
  return `/v1/destinations/${encodeURIComponent(input.destination)}${query({
    origins:
      input.origins === undefined || input.origins.length === 0
        ? undefined
        : input.origins.join(','),
    month: input.month,
    currency: input.currency,
  })}`;
}

export function useDestinationInsights(
  input: UseDestinationInsightsInput,
): ReadState<DestinationInsights> {
  return useTravelRead({
    path: destinationInsightsPath(input),
    schema: destinationInsightsSchema,
    classify: classifyInsights,
  });
}
