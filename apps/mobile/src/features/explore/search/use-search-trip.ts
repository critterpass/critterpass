/**
 * What the search screens read about the trip: the destination, the guide, the plan's days (for
 * the scope label, the chips' weekdays and the examples) and the place a search was opened from.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { guideIdOr, guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

import { weekdayOfDate } from './weekday-names';

export type SearchScope = 'map' | 'day' | 'place' | 'explore';

export interface SearchDay {
  readonly id: string;
  readonly dayNo: number;
  readonly date: string | null;
  /** "Wed", in the app's language. */
  readonly weekday: string | null;
}

export interface SearchTrip {
  readonly loaded: boolean;
  readonly destinationId: string | null;
  readonly destination: string;
  readonly destinationSlug: string | null;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly days: readonly SearchDay[];
  readonly versionId: string | null;
  readonly organiser: boolean;
  /** The trip's zone, for fit lines. */
  readonly tz: string;
  /** A plan stop's title ("Locavore") by stable id. */
  readonly itemTitles: ReadonlyMap<string, string>;
  /** The plan's place names by place id ("≤ 15 min from Tanah Lot"). */
  readonly placeNames: ReadonlyMap<string, string>;
}

function guideOf(slug: string | null | undefined): GuideId {
  return guideIdOr(slug);
}

export function useSearchTrip(tripId: string): SearchTrip {
  const plan = useTripPlan(tripId);
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const guide = guideOf(plan.trip?.guide_slug);
  const days = useMemo(
    () =>
      [...plan.dayRows]
        .sort((a, b) => a.day_no - b.day_no)
        .map((day) => ({
          id: day.id,
          dayNo: day.day_no,
          date: day.date,
          weekday: weekdayOfDate(day.date),
        })),
    // `locale`: the weekday names are worded again when the app's language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.dayRows, locale],
  );
  const itemTitles = useMemo(
    () =>
      new Map(
        plan.itemRows.flatMap((item) => {
          const title = item.booking_title ?? item.poi_name;
          return title === null ? [] : [[item.stable_id, title] as const];
        }),
      ),
    [plan.itemRows],
  );
  return {
    loaded: plan.loaded,
    destinationId: plan.trip?.destination_id ?? null,
    destination: plan.trip?.destination_name ?? '',
    destinationSlug: plan.trip?.destination_slug ?? null,
    guide,
    guideName: guideSticker(guide).name,
    days,
    versionId: plan.versionId,
    organiser: plan.organiser,
    tz: plan.trip?.tz ?? 'UTC',
    itemTitles,
    placeNames: plan.places,
  };
}

const PLACE_SQL = 'SELECT name, lat, lng FROM pois WHERE id = ?';

/** The place a search opened from (scope `place`): its name and spot, when on the phone. */
export function useScopePlace(poiId: string | null) {
  const rows = useLiveRows<{ name: string; lat: number | null; lng: number | null }>(
    PLACE_SQL,
    poiId === null ? null : [poiId],
    ['pois'],
  );
  return rows.rows[0] ?? null;
}
