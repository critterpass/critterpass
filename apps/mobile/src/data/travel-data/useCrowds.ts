/**
 * Crowd levels for a place on a date (`/v1/places/{id}/crowds`), the last good copy offline. With no
 * hourly source the answer carries the month level only (`hourly: null`, chart hidden); `missing`
 * when there is neither an hourly pattern nor a month level.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import type { Classification } from './client';
import type { ReadState } from './freshness';
import { query, useTravelRead } from './use-travel-read';
import { crowdsResponseSchema, type CrowdsResponse } from '@cp/domain';

export interface UseCrowdsInput {
  readonly poiId: string | null;
  /** Local date `YYYY-MM-DD`. */
  readonly date: string | null;
}

export function classifyCrowds(data: CrowdsResponse): Classification {
  if (data.hourly === null && data.month === null) return { status: 'missing' };
  return { status: 'ok', seenAt: data.fetched_at };
}

export function useCrowds(input: UseCrowdsInput): ReadState<CrowdsResponse> {
  const { poiId, date } = input;
  const ready = poiId !== null && date !== null;
  return useTravelRead({
    path: ready ? `/v1/places/${encodeURIComponent(poiId)}/crowds${query({ date })}` : null,
    schema: crowdsResponseSchema,
    classify: classifyCrowds,
  });
}
