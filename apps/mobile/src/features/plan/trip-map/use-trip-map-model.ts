/**
 * The trip map's model as every section 7 plan screen reads it (the trip map, the day plan, its
 * open map, all days): the synced plan and everything around it, with the crew's name, my
 * countdown target (my first departure) and the destination's centre from its curated places.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useVersionLegPaths, type LegPaths } from '@/data/legs/version-leg-paths';
import { useLiveRows } from '@/data/plan/live-rows';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import type { TripMapModel } from './sheet-props';
import { useTripMapData, type TripMapData } from './use-trip-map-data';

const AROUND_SQL = `SELECT c.name AS crew_name, p.countdown_target_at
  FROM trips t
  LEFT JOIN crews c ON c.id = t.crew_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id
    AND p.user_id = (SELECT value FROM local_state WHERE id = ?)
  WHERE t.id = ?`;
const AROUND_TABLES = ['trips', 'crews', 'trip_participants', 'local_state'];

interface AroundRow {
  readonly crew_name: string | null;
  readonly countdown_target_at: string | null;
}

/** The trip's start at 00:00 in its zone, near enough for a count of days. */
function startOf(date: string | null): Date | null {
  return date === null ? null : new Date(`${date}T00:00:00`);
}

export function tripMapModel(
  data: TripMapData,
  around: AroundRow | undefined,
  legPaths?: LegPaths,
): TripMapModel {
  const { plan } = data;
  const trip = plan.trip;
  const curated = data.curated.flatMap((poi) =>
    poi.lat === null || poi.lng === null ? [] : [[poi.lng, poi.lat] as const],
  );
  const center =
    curated.length === 0
      ? null
      : ([
          curated.reduce((sum, [lng]) => sum + lng, 0) / curated.length,
          curated.reduce((sum, [, lat]) => sum + lat, 0) / curated.length,
        ] as const);
  const target = around?.countdown_target_at ?? null;
  return {
    tripId: trip?.id ?? '',
    destination: trip?.destination_name ?? null,
    destinationSlug: trip?.destination_slug ?? null,
    crewName: around?.crew_name ?? null,
    tz: trip?.tz ?? 'UTC',
    startDate: trip?.start_date ?? null,
    endDate: trip?.end_date ?? null,
    countdownTo: target === null ? startOf(trip?.start_date ?? null) : new Date(target),
    days: data.days,
    ...(legPaths === undefined ? {} : { legPaths }),
    members: plan.members,
    me: plan.uid,
    organiser: plan.organiser,
    draft: plan.mode === 'draft',
    readOnly: data.readOnly,
    guide: data.guide,
    check: {
      fixes: data.check.fixes.length,
      know: data.check.know.length,
      done: data.check.check?.status === 'done' && data.check.check.version_id === plan.versionId,
    },
    ideas: data.ideas.ideas,
    placedCount: data.ideas.placedCount,
    curated: data.curated,
    planned: new Set(
      plan.state.items.flatMap((item) => (item.poi_id == null ? [] : [item.poi_id])),
    ),
    reviews: data.reviews,
    regionUri: data.regionUri,
    empty: data.empty,
    center,
  };
}

export function useTripMapModel(tripId: string): {
  readonly data: TripMapData;
  readonly model: TripMapModel;
} {
  const data = useTripMapData(tripId);
  const around = useLiveRows<AroundRow>(AROUND_SQL, [OWNER_UID_KEY, tripId], AROUND_TABLES);
  const legPaths = useVersionLegPaths(data.plan.versionId);
  const model = useMemo(
    () => tripMapModel(data, around.rows[0], legPaths),
    [data, around.rows, legPaths],
  );
  return { data, model };
}
