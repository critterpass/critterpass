/**
 * The places map's and list's local reads, all from the phone so both work offline: the trip's plan
 * (its stops, its stay, its days and crew), the crew's ideas, the destination's curated places and
 * the places I hid. Outside a trip the same map reads the destination and my own saved places.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useTripIdeas, type TripIdeaView } from '@/data/ideas/use-trip-ideas';
import { useLiveRows } from '@/data/plan/live-rows';
import { useTripPlan, type TripPlan } from '@/data/plan/use-trip-plan';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useExploreStream } from '../data/use-explore-stream';
import { useDestinationPois } from '../map-queries';
import type { Point } from '../map-model';
import { useDestinationRow } from '../queries';
import { useSaved } from '../saved-queries';
import { hubPlaces, type HubPlace, type IdeaPlace, type PlanStop } from './places-model';

const HIDDEN_SQL = `SELECT poi_id FROM place_hides
  WHERE user_id = (SELECT value FROM local_state WHERE id = ?)`;
const HIDDEN_TABLES = ['place_hides', 'local_state'];

export interface PlacesData {
  readonly loaded: boolean;
  readonly places: readonly HubPlace[];
  readonly plan: TripPlan;
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

/** The plan's stops at a curated place, with where they are. */
function planStops(plan: TripPlan): { stops: PlanStop[]; stay: PlacesData['stay'] } {
  const stops: PlanStop[] = [];
  let stay: PlacesData['stay'] = null;
  for (const row of plan.itemRows) {
    if (row.status === 'cancelled') continue;
    const at = plan.display.get(row.stable_id)?.place ?? null;
    const name = plan.display.get(row.stable_id)?.title ?? row.poi_name ?? '';
    if (row.category === 'stay') {
      if (stay === null && at !== null) stay = { name, at };
      continue;
    }
    if (row.poi_id === null || at === null) continue;
    stops.push({
      poiId: row.poi_id,
      name,
      category: row.category ?? 'other',
      lat: at.lat,
      lng: at.lng,
      dayNo: row.day_no,
    });
  }
  return { stops, stay };
}

export interface PlacesDataInput {
  readonly tripId: string | null;
  /** Outside a trip: the destination's id or slug. */
  readonly destination?: string | null | undefined;
  /** Results mode: only these places. */
  readonly results?: ReadonlySet<string> | null | undefined;
}

export function usePlacesData({ tripId, destination, results }: PlacesDataInput): PlacesData {
  const plan = useTripPlan(tripId);
  const ref = tripId === null ? (destination ?? null) : (plan.trip?.destination_id ?? null);
  const { row } = useDestinationRow(ref);
  const destinationId = row?.id ?? null;
  useExploreStream(destinationId);
  const curated = useDestinationPois(destinationId);
  const tripIdeas = useTripIdeas(tripId);
  const saved = useSaved();
  const hiddenRows = useLiveRows<{ poi_id: string }>(HIDDEN_SQL, [OWNER_UID_KEY], HIDDEN_TABLES);

  const { stops, stay } = useMemo(() => planStops(plan), [plan]);
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
  const places = useMemo(
    () =>
      hubPlaces({
        curated: curated.places,
        ideas,
        stops,
        hiddenIds,
        results,
        destination: destinationName,
      }),
    [curated.places, ideas, stops, hiddenIds, results, destinationName],
  );
  return {
    loaded: curated.loaded && (tripId === null || (plan.loaded && tripIdeas.loaded)),
    places,
    plan,
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
