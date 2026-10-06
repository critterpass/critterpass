/**
 * Everything the trip map reads (7a-1…7a-3, 7i-1), from synced rows only so it opens offline: the
 * plan I see (the crew's, or my own draft before there is one), its days with stays, votes and the
 * plan check's issues, the trip's Ideas, my placed-ideas reviews waiting on me, the destination's
 * curated places and the downloaded map region.
 */
import { useMemo } from 'react';

import { useTripAreas } from '@/data/areas/use-trip-areas';
import { usePlanCheck, type PlanCheckView } from '@/data/checks/use-plan-check';
import { useTripIdeas, type TripIdeas } from '@/data/ideas/use-trip-ideas';
import { useLiveRows } from '@/data/plan/live-rows';
import { usePendingReviews, type PendingReview } from '@/data/plan/use-pending-reviews';
import { useEnsurePlanDays } from '@/data/plan/use-plan-days';
import { useTripPlan, type TripPlan } from '@/data/plan/use-trip-plan';
import { useRegionPack } from '@/data/places/useRegionPack';
import { guideIdOr, guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

import { DESTINATION_PLACES_SQL, PLACES_TABLES } from '../day/queries';
import { POLLS_SQL, POLLS_TABLES, type OpenPollRow } from '../overview/data/plan-rows';
import { todayIn } from '../overview/data/use-plan-data';
import type { CuratedPlace } from './map-places';
import { usePersonalLayer } from './personal-layer';
import { draftStageOf } from './draft-stage';
import { useChosenDay } from './chosen-day';
import { buildTripDays, dayAreaMarks, mapAreaOf, type TripDay } from './trip-days';

export { categoryChips, litPlaces, mapPlaces, NO_FILTER, type MapFilter } from './map-places';

export interface TripMapData {
  readonly loaded: boolean;
  readonly plan: TripPlan;
  readonly days: readonly TripDay[];
  readonly ideas: TripIdeas;
  readonly check: PlanCheckView;
  readonly reviews: readonly PendingReview[];
  readonly curated: readonly CuratedPlace[];
  readonly regionUri: string | null;
  /** The slug of the area the map shows: the chosen day's area, else the trip's destination. */
  readonly mapSlug: string | null;
  /** Nothing in the plan and nothing saved, or no plan I can see: the ways to start (7i-1). */
  readonly empty: boolean;
  readonly guide: { readonly id: GuideId; readonly name: string };
  /** Today in the trip's zone while the trip runs; null before and after. */
  readonly today: string | null;
  /** Past trips, cancelled ones and members who left read the plan without editing. */
  readonly readOnly: boolean;
}

export function guideFor(plan: TripPlan): TripMapData['guide'] {
  const slug = plan.trip?.guide_slug ?? null;
  return {
    id: guideIdOr(slug),
    name: plan.trip?.guide_name ?? guideSticker(slug).name,
  };
}

export function isReadOnly(plan: TripPlan): boolean {
  const trip = plan.trip;
  return (
    trip !== null &&
    (trip.phase === 'post' ||
      trip.phase === 'cancelled' ||
      trip.my_rsvp === 'out' ||
      trip.my_role === null ||
      // Her own draft is hers to edit, except while the guide is drafting or redrafting it.
      (plan.mode === 'draft' && draftStageOf(trip.status) === 'guideWorking'))
  );
}

/** The plan's days with the trip's open votes and the plan check's issues laid on. */
export function useTripDays(plan: TripPlan): {
  readonly days: readonly TripDay[];
  readonly check: PlanCheckView;
  readonly polls: readonly OpenPollRow[];
} {
  const tripId = plan.trip?.id ?? null;
  const polls = useLiveRows<OpenPollRow>(
    POLLS_SQL,
    tripId === null ? null : [tripId],
    POLLS_TABLES,
  );
  // On her own draft the check is the draft's: nobody else has its issues.
  const check = usePlanCheck(tripId, plan.mode === 'draft' ? plan.versionId : null);
  // "Just me" lies over the crew's plan only: a draft is nobody's but its author's.
  const personal = usePersonalLayer(plan.mode === 'group' ? tripId : null, plan.uid, plan.state);
  // The plan's own days, so an optimistic reorder moves a day's area with its stops.
  const tripAreas = useTripAreas(tripId, plan.state.days);
  const areas = useMemo(() => dayAreaMarks(tripAreas), [tripAreas]);
  const days = useMemo(
    () =>
      buildTripDays({
        state: plan.state,
        display: plan.display,
        dayRows: plan.dayRows,
        themes: plan.themes,
        tz: plan.trip?.tz ?? 'UTC',
        polls: polls.rows,
        issues: [...check.fixes, ...check.know],
        personal,
        areas,
      }),
    [plan, polls.rows, check.fixes, check.know, personal, areas],
  );
  return { days, check, polls: polls.rows };
}

export function useTripMapData(tripId: string): TripMapData {
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  // An organiser opening a trip that has dates and no plan yet: its days are asked for.
  useEnsurePlanDays(plan);
  const { days, check } = useTripDays(plan);
  const ideas = useTripIdeas(tripId);
  const pending = usePendingReviews(tripId);
  // The map shows the places and the detailed tiles of the area the chosen day is spent in.
  const [chosen] = useChosenDay(tripId);
  const mapArea = mapAreaOf(
    { id: plan.trip?.destination_id ?? null, slug: plan.trip?.destination_slug ?? null },
    days.find((day) => day.dayNo === chosen) ?? null,
  );
  const destinationId = mapArea.id;
  const curated = useLiveRows<CuratedPlace>(
    DESTINATION_PLACES_SQL,
    destinationId === null ? null : [destinationId],
    PLACES_TABLES,
  );
  const pack = useRegionPack(destinationId ?? '', mapArea.slug ?? '');
  const planned = plan.state.items.length;
  const inTrip = plan.trip?.phase === 'in';
  const tz = plan.trip?.tz ?? null;
  return useMemo(
    () => ({
      loaded: plan.uidLoaded && plan.loaded && ideas.loaded,
      plan,
      days,
      ideas,
      check,
      reviews: pending.reviews,
      curated: curated.rows,
      mapSlug: mapArea.slug,
      regionUri: pack.status === 'downloaded' ? pack.localPmtilesUri : null,
      // Nothing planned and nothing saved, or no plan this person can see yet (a member before
      // the plan is shared, whatever they have saved): the sheet says how things start.
      empty:
        (planned === 0 && ideas.ideas.length === 0 && ideas.placedCount === 0) ||
        (plan.loaded && plan.versionId === null),
      guide: guideFor(plan),
      today: inTrip ? todayIn(tz) : null,
      readOnly: isReadOnly(plan),
    }),
    [
      plan,
      days,
      ideas,
      check,
      pending.reviews,
      curated.rows,
      mapArea.slug,
      pack,
      planned,
      inTrip,
      tz,
    ],
  );
}
