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

import { checkCounts, type CheckCounts } from './sheet-copy';
import type { TripMapModel } from './sheet-props';
import { useTripMapData, type TripMapData } from './use-trip-map-data';
import { draftStageOf } from './draft-stage';

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

/** The roads seen so far for each trip's legs, by pair. */
type LegRoad = NonNullable<ReturnType<LegPaths['get']>>;
const knownPaths = new Map<string, Map<string, LegRoad>>();

/**
 * The version's leg roads with the last road seen for every pair it has not routed yet: an edit
 * makes a new version whose legs arrive a little later, and until then the pairs that did not
 * change keep their road instead of a straight line across the map.
 */
export function withKnownPaths(tripId: string, paths: LegPaths): LegPaths {
  const seen = knownPaths.get(tripId) ?? new Map<string, LegRoad>();
  knownPaths.set(tripId, seen);
  for (const [pair, path] of paths) seen.set(pair, path);
  return seen.size === paths.size ? paths : new Map(seen);
}

/** The last counts the check gave each trip, kept while it runs again on a new version. */
const lastCounts = new Map<string, CheckCounts>();

function currentCheck(tripId: string, data: TripMapData, versionId: string | null): CheckCounts {
  const view = data.check;
  const counts = checkCounts(
    {
      check: view.check,
      fixes: view.fixes.length,
      know: view.know.length,
      checking: view.checking,
    },
    versionId,
    lastCounts.get(tripId),
  );
  if (counts.done && counts.checking !== true) lastCounts.set(tripId, counts);
  return counts;
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
    // The slug the map's tiles go by: the chosen day's area on a day trip.
    destinationSlug: data.mapSlug ?? trip?.destination_slug ?? null,
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
    ...(plan.mode === 'draft' && trip !== null
      ? { draftStage: draftStageOf(trip.status), draftVersionId: plan.versionId }
      : {}),
    readOnly: data.readOnly,
    guide: data.guide,
    check: currentCheck(trip?.id ?? '', data, plan.versionId),
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
  const versionPaths = useVersionLegPaths(data.plan.versionId);
  const legPaths = useMemo(() => withKnownPaths(tripId, versionPaths), [tripId, versionPaths]);
  const model = useMemo(
    () => tripMapModel(data, around.rows[0], legPaths),
    [data, around.rows, legPaths],
  );
  return { data, model };
}
