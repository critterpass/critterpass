/**
 * Crew plans read through the api (shared content, never synced): the browse page, one plan, its
 * overlap with the crew's trip, the trip's own publishing state and the places to rate. The
 * browse and plan reads keep their last good copy on the phone so a destination opened once still
 * shows offline; the trip's own state is always asked fresh.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and cache ids, never copy. */
import {
  sharedPlanDetailSchema,
  sharedPlanGuideNoteSchema,
  sharedPlansPageSchema,
  tripRatingCardsSchema,
  tripSharedPlanSchema,
  type SharedPlanDetail,
  type SharedPlanGuideNote,
  type SharedPlansPage,
  type TripRatingCards,
  type TripSharedPlan,
} from '@cp/domain';
import { useCallback, useEffect, useState } from 'react';

import {
  createLastGoodCache,
  readThrough,
  useTravelDataReader,
  type LastGoodCache,
  type WireParser,
} from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';

export interface BrowseFilters {
  readonly daysMin?: number;
  readonly daysMax?: number;
  readonly month?: number;
  readonly crewMin?: number;
  readonly crewMax?: number;
  readonly tags?: readonly string[];
  readonly sort?: 'match' | 'newest' | 'rating';
}

export function browsePath(destination: string, tripId: string | null, filters: BrowseFilters) {
  const query = new URLSearchParams({ destination_id: destination });
  if (tripId !== null) query.set('trip_id', tripId);
  if (filters.daysMin !== undefined) query.set('days_min', String(filters.daysMin));
  if (filters.daysMax !== undefined) query.set('days_max', String(filters.daysMax));
  if (filters.month !== undefined) query.set('month', String(filters.month));
  if (filters.crewMin !== undefined) query.set('crew_min', String(filters.crewMin));
  if (filters.crewMax !== undefined) query.set('crew_max', String(filters.crewMax));
  if (filters.tags !== undefined && filters.tags.length > 0)
    query.set('tags', filters.tags.join(','));
  if (filters.sort !== undefined) query.set('sort', filters.sort);
  return `/v1/shared-plans?${query.toString()}`;
}

let cache: LastGoodCache | undefined;
function communityCache(): LastGoodCache {
  cache ??= createLastGoodCache('cp-community', { max: 60 });
  return cache;
}

/** A cache that never answers: the trip's own state must be fresh or absent. */
const NO_CACHE: LastGoodCache = { get: () => undefined, set: () => undefined };

const classify = () => ({ status: 'ok' as const, seenAt: null });

/** One api read as a hook: loading until the first answer, then that answer; `reload` asks again. */
function useRead<T>(path: string | null, schema: WireParser<T>, keep: boolean) {
  const reader = useTravelDataReader();
  const [state, setState] = useState<ReadState<T>>({ status: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    void readThrough({
      reader,
      cache: keep ? communityCache() : NO_CACHE,
      path,
      schema,
      classify,
      signal: controller.signal,
    }).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, [reader, path, schema, keep, round]);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  return { state, reload };
}

export function useSharedPlans(destination: string, tripId: string | null, filters: BrowseFilters) {
  return useRead<SharedPlansPage>(
    browsePath(destination, tripId, filters),
    sharedPlansPageSchema,
    true,
  );
}

export function useSharedPlan(id: string) {
  return useRead<SharedPlanDetail>(
    `/v1/shared-plans/${encodeURIComponent(id)}`,
    sharedPlanDetailSchema,
    true,
  );
}

export function useGuideNote(id: string, tripId: string | null) {
  return useRead<SharedPlanGuideNote>(
    tripId === null
      ? null
      : `/v1/shared-plans/${encodeURIComponent(id)}/guide-note?trip_id=${encodeURIComponent(tripId)}`,
    sharedPlanGuideNoteSchema,
    true,
  );
}

/** `null`: no trip to ask about (the read stays loading and asks nothing). */
export function useTripSharedPlan(tripId: string | null) {
  return useRead<TripSharedPlan>(
    tripId === null ? null : `/v1/trips/${encodeURIComponent(tripId)}/shared-plan`,
    tripSharedPlanSchema,
    false,
  );
}

export function useRatingCards(tripId: string) {
  return useRead<TripRatingCards>(
    `/v1/trips/${encodeURIComponent(tripId)}/rating-cards`,
    tripRatingCardsSchema,
    false,
  );
}

/** The data of a settled read, if it has any. */
export function dataOf<T>(state: ReadState<T>): T | null {
  return state.status === 'ok' || state.status === 'stale' ? state.data : null;
}
