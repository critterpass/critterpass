/**
 * The places map's and list's local reads, all from the phone so both work offline: the trip's plan
 * (its stops, its stay, its days and crew), the crew's ideas, the destination's curated places and
 * the places I hid. Outside a trip the same map reads the destination and my own saved places.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback, useMemo } from 'react';

import { useTripIdeas, type TripIdeaView } from '@/data/ideas/use-trip-ideas';
import { useVersionLegPaths } from '@/data/legs/version-leg-paths';
import { useLiveRows } from '@/data/plan/live-rows';
import { useTripPlan, type TripPlan } from '@/data/plan/use-trip-plan';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useExploreStream } from '../data/use-explore-stream';
import { useDestinationPois } from '../map-queries';
import { fold, type Point } from '../map-model';
import { useDestinationRow } from '../queries';
import { useSaved } from '../saved-queries';
import { routeDays, type PlanRouteDay, type RouteItem } from './plan-routes';
import { hubPlaces, type HubPlace, type IdeaPlace, type PlanStop } from './places-model';

const HIDDEN_SQL = `SELECT poi_id FROM place_hides
  WHERE user_id = (SELECT value FROM local_state WHERE id = ?)`;
const HIDDEN_TABLES = ['place_hides', 'local_state'];

/** A crewmate as the map and list name and colour them. */
export interface CrewMember {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

export interface PlacesData {
  readonly loaded: boolean;
  readonly places: readonly HubPlace[];
  /** Every crew row in join order (colours follow the whole crew's join order). */
  readonly crew: readonly CrewMember[];
  readonly uid: string | null;
  /** The plan version fits answer for. */
  readonly versionId: string | null;
  /** The plan's days with their local dates. */
  readonly days: readonly { readonly dayNo: number; readonly date: string | null }[];
  /** The plan's days as numbered routes. */
  readonly routes: readonly PlanRouteDay[];
  /** A plan stop's short name by stable id (fit lines: "after lunch"). */
  readonly stopName: (stableId: string) => string | null;
  /** The trip's ideas with their synced fits (none outside a trip). */
  readonly ideas: readonly TripIdeaView[];
  readonly destinationId: string | null;
  readonly destinationSlug: string | null;
  readonly destinationName: string;
  readonly guideSlug: string | null;
  readonly guideName: string | null;
  readonly tz: string | null;
  /** The curated places I hid, for the list's "Hidden places". */
  readonly hidden: readonly { readonly poiId: string; readonly name: string }[];
  /** The plan's stay: where "min from the villa" is measured from. */
  readonly stay: { readonly name: string; readonly at: Point } | null;
}

/** The plan's stops at a curated place, its route items and its stay. */
function planStops(plan: TripPlan): {
  stops: PlanStop[];
  items: RouteItem[];
  stay: PlacesData['stay'];
} {
  const stops: PlanStop[] = [];
  const items: RouteItem[] = [];
  let stay: PlacesData['stay'] = null;
  for (const row of plan.itemRows) {
    if (row.status === 'cancelled') continue;
    const at = plan.display.get(row.stable_id)?.place ?? null;
    const name = plan.display.get(row.stable_id)?.title ?? row.poi_name ?? '';
    if (row.category === 'stay') {
      if (stay === null && at !== null) stay = { name, at };
      continue;
    }
    if (at === null) continue;
    items.push({
      id: row.poi_id ?? row.stable_id,
      legKey: row.stable_id,
      dayNo: row.day_no,
      startsAt: row.starts_at,
      name,
      lat: at.lat,
      lng: at.lng,
    });
    if (row.poi_id === null) continue;
    stops.push({
      poiId: row.poi_id,
      name,
      category: row.category ?? 'other',
      lat: at.lat,
      lng: at.lng,
      dayNo: row.day_no,
    });
  }
  return { stops, items, stay };
}

export interface PlacesDataInput {
  readonly tripId: string | null;
  /** Outside a trip: the destination's id or slug. */
  readonly destination?: string | null | undefined;
  /** Results mode: only these places. */
  readonly results?: ReadonlySet<string> | null | undefined;
  /** Typed into the map's own field (outside a trip): places whose name holds it. */
  readonly query?: string | undefined;
}

export function usePlacesData({
  tripId,
  destination,
  results,
  query = '',
}: PlacesDataInput): PlacesData {
  const plan = useTripPlan(tripId);
  const ref = tripId === null ? (destination ?? null) : (plan.trip?.destination_id ?? null);
  const { row } = useDestinationRow(ref);
  const destinationId = row?.id ?? null;
  useExploreStream(destinationId);
  const curated = useDestinationPois(destinationId);
  const tripIdeas = useTripIdeas(tripId);
  const saved = useSaved();
  const hiddenRows = useLiveRows<{ poi_id: string }>(HIDDEN_SQL, [OWNER_UID_KEY], HIDDEN_TABLES);

  const { stops, items, stay } = useMemo(() => planStops(plan), [plan]);
  const days = useMemo(
    () => plan.dayRows.map((day) => ({ dayNo: day.day_no, date: day.date })),
    [plan.dayRows],
  );
  // The roads the plan's stored legs follow, so the day routes run along the streets.
  const legPaths = useVersionLegPaths(tripId === null ? null : plan.versionId);
  const routes = useMemo(() => routeDays(items, days, legPaths), [items, days, legPaths]);
  const crew = useMemo(
    () =>
      plan.crew.map((member, index) => ({
        uid: member.user_id,
        name: member.display_name ?? '',
        joinIndex: index,
      })),
    [plan.crew],
  );
  const { display } = plan;
  const stopName = useCallback(
    (stableId: string) => display.get(stableId)?.title ?? null,
    [display],
  );
  const ideas = useMemo((): IdeaPlace[] => {
    if (tripId !== null) return [...tripIdeas.ideas];
    // Outside a trip, my own saved places are the saved ones.
    const byId = new Map(curated.places.map((poi) => [poi.id, poi]));
    return saved.rows.flatMap((entry) => {
      const poi = byId.get(entry.refId);
      return poi === undefined
        ? []
        : [
            {
              id: poi.id,
              poiId: poi.id,
              name: poi.name,
              category: poi.category,
              lat: poi.lat,
              lng: poi.lng,
              backerIds: [],
            },
          ];
    });
  }, [tripId, tripIdeas.ideas, curated.places, saved.rows]);
  const hiddenIds = useMemo(
    () => new Set(hiddenRows.rows.map((entry) => entry.poi_id)),
    [hiddenRows.rows],
  );
  const hidden = useMemo(
    () =>
      curated.places
        .filter((poi) => hiddenIds.has(poi.id))
        .map((poi) => ({ poiId: poi.id, name: poi.name })),
    [curated.places, hiddenIds],
  );
  const destinationName = row?.name ?? plan.trip?.destination_name ?? '';
  const places = useMemo(() => {
    const all = hubPlaces({
      curated: curated.places,
      ideas,
      stops,
      hiddenIds,
      results,
      destination: destinationName,
    });
    const needle = fold(query.trim());
    return needle === '' ? all : all.filter((place) => fold(place.name).includes(needle));
  }, [curated.places, ideas, stops, hiddenIds, results, destinationName, query]);
  return {
    loaded: curated.loaded && (tripId === null || (plan.loaded && tripIdeas.loaded)),
    places,
    crew,
    uid: plan.uid,
    versionId: plan.versionId,
    days,
    routes,
    stopName,
    ideas: tripIdeas.ideas,
    destinationId,
    destinationSlug: row?.slug ?? null,
    destinationName,
    guideSlug: plan.trip?.guide_slug ?? row?.guide_slug ?? null,
    guideName: plan.trip?.guide_name ?? null,
    tz: plan.trip?.tz ?? row?.tz ?? null,
    hidden,
    stay,
  };
}
