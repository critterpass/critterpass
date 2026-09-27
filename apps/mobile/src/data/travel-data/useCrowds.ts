/**
 * Crowd levels for a place on a date: from the synced trip pack when the place and its
 * destination's reviewed month curve are on the device, else `/v1/places/{id}/crowds`. With no
 * hourly source the answer carries the month level only (`hourly: null`, chart hidden); `missing`
 * when there is neither an hourly pattern nor a month level.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import { useContext } from 'react';

import { LocalFirstContext } from '../powersync/local-first-context';
import type { Classification } from './client';
import type { ReadState } from './freshness';
import { readLocalCrowds } from './local';
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
  const local = useContext(LocalFirstContext);
  const { poiId, date } = input;
  const ready = poiId !== null && date !== null;
  return useTravelRead({
    path: ready ? `/v1/places/${encodeURIComponent(poiId)}/crowds${query({ date })}` : null,
    schema: crowdsResponseSchema,
    classify: classifyCrowds,
    ...(local === null || !ready
      ? {}
      : {
          local: async () => {
            const data = await readLocalCrowds(local.db, poiId, date);
            if (data === null || classifyCrowds(data).status === 'missing') return null;
            return { status: 'ok', data, seenAt: data.fetched_at, source: 'synced' } as const;
          },
        }),
  });
}
