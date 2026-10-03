/**
 * What the search screens read about the trip: the destination, the guide, the plan's days (for
 * the scope label, the chips' weekdays and the examples) and the place a search was opened from.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

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
  readonly guide: GuideId;
  readonly guideName: string;
  readonly days: readonly SearchDay[];
  readonly versionId: string | null;
  readonly organiser: boolean;
}

function guideOf(slug: string | null | undefined): GuideId {
  return slug !== null && slug !== undefined && slug in GUIDE_STICKERS
    ? (slug as GuideId)
    : 'tokek';
}

export function weekdayOf(date: string | null, locale: string): string | null {
  if (date === null) return null;
  const at = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
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
          weekday: weekdayOf(day.date, locale),
        })),
    [plan.dayRows, locale],
  );
  return {
    loaded: plan.loaded,
    destinationId: plan.trip?.destination_id ?? null,
    destination: plan.trip?.destination_name ?? '',
    guide,
    guideName: GUIDE_STICKERS[guide].name,
    days,
    versionId: plan.versionId,
    organiser: plan.organiser,
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
