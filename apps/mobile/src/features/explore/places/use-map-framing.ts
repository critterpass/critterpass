/**
 * Where the places map looks (7c-1): opened without a place it frames where the crew's places
 * mostly are; a chosen filter (or a search's results) frames that filter's places, so FOOD shows
 * food and never an empty street; a picked place eases to sit above its cards.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { PlanningCamera } from '@/ui/map/planning';

import type { Point } from '../map-model';
import { openingFrame } from './plan-routes';
import { passesFilter, type HubPlace, type PlacesFilter } from './places-model';

type LngLat = readonly [number, number];

/** The points the camera fits for a filter: the crew's own places for ALL, else what the filter lights. */
export function framePoints(
  places: readonly HubPlace[],
  filter: PlacesFilter,
  stay: Point | null,
  narrowed: boolean,
): LngLat[] {
  if (filter === 'all' && !narrowed) {
    const core = [
      ...(stay === null ? [] : [stay]),
      ...places.filter((place) => place.standing !== 'suggested'),
    ];
    return [...openingFrame(core, places)];
  }
  const lit = places.filter((place) => passesFilter(place, filter));
  return [...openingFrame(lit, lit)];
}

export interface MapFramingInput {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  /** The search's results the map is narrowed to, as one key; null outside results mode. */
  readonly resultsKey: string | null;
  readonly stay: Point | null;
  /** The camera has settled once (the map is drawn). */
  readonly ready: boolean;
  /** Opened on a place: the first frame is that place, not the filter's. */
  readonly opensOnPlace: boolean;
  readonly focused: HubPlace | null;
  readonly camera: Pick<PlanningCamera, 'fitPoints' | 'flyToPlace'>;
  readonly coveredTop: number;
  readonly peekBottom: number;
  readonly cardsBottom: number;
}

export function useMapFraming(input: MapFramingInput): {
  /** Moves the map to the filter's places. */
  readonly showAll: () => void;
  /** How many places the filter lights, in view or not. */
  readonly lit: number;
} {
  const { places, filter, resultsKey, stay, ready, focused } = input;
  const { fitPoints, flyToPlace } = input.camera;
  const { coveredTop, peekBottom, cardsBottom } = input;
  const key = `${filter}|${resultsKey ?? ''}`;
  const lit = useMemo(
    () => places.filter((place) => passesFilter(place, filter)).length,
    [places, filter],
  );
  const framed = useRef<string | null>(input.opensOnPlace ? key : null);
  const frame = useCallback(() => {
    const points = framePoints(places, filter, stay, resultsKey !== null);
    const only = points[0];
    if (only === undefined) return false;
    // One place has no box to fit: the camera goes to it.
    if (points.length === 1) flyToPlace([only[0], only[1]]);
    else fitPoints(points, { top: coveredTop, bottom: peekBottom });
    return true;
  }, [places, filter, stay, resultsKey, fitPoints, flyToPlace, coveredTop, peekBottom]);

  useEffect(() => {
    if (framed.current === key || places.length === 0 || !ready) return;
    if (frame()) framed.current = key;
  }, [key, places.length, ready, frame]);

  useEffect(() => {
    if (focused === null) return;
    flyToPlace([focused.lng, focused.lat], { covered: { top: coveredTop, bottom: cardsBottom } });
  }, [flyToPlace, focused, coveredTop, cardsBottom]);

  return { showAll: frame, lit };
}
