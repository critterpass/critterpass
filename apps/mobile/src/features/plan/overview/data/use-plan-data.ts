/**
 * `usePlanData(tripId)`: the trip's plan from the synced rows as every plan surface reads it:
 * who I am on the trip, which version I see (the crew's current one, or an organiser's private
 * draft before it is proposed), its days and labelled items, open decisions, the forecast and
 * applied guide changes. Pure reads; the trip route layout holds the streams that fill them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, states and wire values, never copy. */
import { useMemo } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import {
  buildDayCards,
  toPlanDays,
  toPlanItems,
  type DayCard,
  type PlanDay,
  type PlanItem,
} from '../model/plan-model';
import { useLiveRows } from './live-rows';
import {
  DAYS_SQL,
  DAYS_TABLES,
  GUIDE_CHANGES_SQL,
  GUIDE_CHANGES_TABLES,
  ITEMS_SQL,
  ITEMS_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  POLLS_SQL,
  POLLS_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  UID_SQL,
  UID_TABLES,
  WEATHER_SQL,
  WEATHER_TABLES,
  type GuideChangeRow,
  type MemberRow,
  type OpenPollRow,
  type PlanDayRow,
  type PlanItemRow,
  type PlanTripRow,
  type WeatherRow,
} from './plan-rows';

export type PlanMode = 'group' | 'draft';

export interface PlanData {
  readonly status: 'loading' | 'missing' | 'no_plan' | 'ready';
  readonly uid: string | null;
  readonly trip: PlanTripRow | null;
  /** The version shown: the crew's current one, or (organisers only) the unproposed draft. */
  readonly versionId: string | null;
  readonly mode: PlanMode;
  readonly organiser: boolean;
  /** Past trips, cancelled ones and members who dropped out read the plan without editing. */
  readonly readOnly: boolean;
  readonly days: readonly PlanDay[];
  readonly items: readonly PlanItem[];
  readonly polls: readonly OpenPollRow[];
  readonly weather: readonly WeatherRow[];
  readonly guideChanges: readonly GuideChangeRow[];
  readonly members: readonly MemberRow[];
}

/** Today's date in `tz` (`YYYY-MM-DD`). */
export function todayIn(tz: string | null, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(now);
}

export function usePlanData(tripId: string | null): PlanData {
  const uidRows = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES);
  const uid = uidRows.rows[0]?.value ?? null;
  const tripRows = useLiveRows<PlanTripRow>(
    TRIP_SQL,
    uid === null || tripId === null ? null : [uid, tripId],
    TRIP_TABLES,
  );
  const trip = tripRows.rows[0] ?? null;
  const organiser = trip?.my_role === 'organiser';
  const mode: PlanMode =
    trip !== null && trip.current_version_id === null && organiser && trip.draft_version_id
      ? 'draft'
      : 'group';
  const versionId =
    trip === null ? null : mode === 'draft' ? trip.draft_version_id : trip.current_version_id;
  const days = useLiveRows<PlanDayRow>(
    DAYS_SQL,
    versionId === null ? null : [versionId],
    DAYS_TABLES,
  );
  const items = useLiveRows<PlanItemRow>(
    ITEMS_SQL,
    versionId === null ? null : [versionId],
    ITEMS_TABLES,
  );
  const polls = useLiveRows<OpenPollRow>(
    POLLS_SQL,
    tripId === null ? null : [tripId],
    POLLS_TABLES,
  );
  const weather = useLiveRows<WeatherRow>(
    WEATHER_SQL,
    trip?.destination_id ? [trip.destination_id] : null,
    WEATHER_TABLES,
  );
  const guideChanges = useLiveRows<GuideChangeRow>(
    GUIDE_CHANGES_SQL,
    tripId === null ? null : [tripId],
    GUIDE_CHANGES_TABLES,
  );
  const members = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    trip === null ? null : [trip.crew_id],
    MEMBERS_TABLES,
  );

  const planDays = useMemo(() => toPlanDays(days.rows), [days.rows]);
  const planItems = useMemo(() => toPlanItems(items.rows), [items.rows]);
  const status: PlanData['status'] =
    !uidRows.loaded || !tripRows.loaded
      ? 'loading'
      : trip === null
        ? 'missing'
        : versionId === null
          ? 'no_plan'
          : !days.loaded || !items.loaded
            ? 'loading'
            : planDays.length === 0
              ? 'no_plan'
              : 'ready';
  const readOnly =
    trip !== null &&
    (trip.phase === 'post' ||
      trip.phase === 'cancelled' ||
      trip.my_rsvp === 'out' ||
      trip.my_role === null);

  return {
    status,
    uid,
    trip,
    versionId,
    mode,
    organiser,
    readOnly,
    days: planDays,
    items: planItems,
    polls: polls.rows,
    weather: weather.rows,
    guideChanges: guideChanges.rows,
    members: members.rows,
  };
}

/** The overview's day cards, with past days known once the trip is under way. */
export function useDayCards(data: PlanData): DayCard[] {
  const inTrip = data.trip?.phase === 'in';
  const tz = data.trip?.tz ?? null;
  return useMemo(
    () =>
      buildDayCards({
        days: data.days,
        items: data.items,
        polls: data.polls,
        weather: data.weather,
        today: inTrip ? todayIn(tz) : null,
      }),
    [data.days, data.items, data.polls, data.weather, inTrip, tz],
  );
}
