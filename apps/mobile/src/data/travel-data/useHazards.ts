/**
 * A destination's current hazard alerts (`/v1/hazards`): volcano levels and weather warnings with
 * their official source; `stale` when any alert has not been read lately.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import type { Classification } from './client';
import type { ReadState } from './freshness';
import { query, useTravelRead } from './use-travel-read';
import { hazardsResponseSchema, type HazardsResponse } from '@cp/domain';

export function classifyHazards(data: HazardsResponse): Classification {
  const read = data.alerts.map((alert) => alert.fetched_at);
  const seenAt = read.length === 0 ? null : read.reduce((a, b) => (a < b ? a : b));
  return data.alerts.some((alert) => alert.stale)
    ? { status: 'stale', seenAt, reason: 'old' }
    : { status: 'ok', seenAt };
}

export function hazardsPath(destination: string | null): string | null {
  return destination === null ? null : `/v1/hazards${query({ destination_id: destination })}`;
}

export function useHazards(destination: string | null): ReadState<HazardsResponse> {
  return useTravelRead({
    path: hazardsPath(destination),
    schema: hazardsResponseSchema,
    classify: classifyHazards,
  });
}
