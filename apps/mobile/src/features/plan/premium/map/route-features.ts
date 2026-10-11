/**
 * What the premium plan map draws for the trip's days (4.25–4.28): the chosen day's route leg by
 * leg (driving and other legs solid, walks dotted, a boat as a curved dotted arc), its stops as
 * numbered pins in the day's colour, and every other day's stops as small dots in theirs. Choosing
 * a day traces its route out from the stay. Pure: the layers turn these into MapLibre features.
 */
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

import { dayColours } from './day-colours';

export type Coord = readonly [number, number];
export type LegMode = 'car' | 'walk' | 'boat';

export interface MapStop {
  readonly id: string;
  /** Its number in the day. */
  readonly n: number;
  readonly lat: number;
  readonly lng: number;
  /** The stop's key in its legs (the item's stable id) when it is not `id`. */
  readonly legKey?: string;
}

export interface MapDay {
  readonly dayNo: number;
  readonly stops: readonly MapStop[];
  /** Road paths of the day's legs, `[lng, lat]`, keyed `from>to` (`stay` or a stop's leg key). */
  readonly legPaths?: ReadonlyMap<string, readonly Coord[]>;
  /** How each leg is travelled, same keys; a leg not listed is driven. */
  readonly legModes?: ReadonlyMap<string, LegMode>;
}

export interface LegProperties {
  readonly color: string;
  readonly mode: LegMode;
}

export interface PinProperties {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  /** The chosen day's numbered pin, or another day's small dot. */
  readonly kind: 'pin' | 'dot';
  /** Filtered out (another filter chip is on): drawn faint. */
  readonly faded: boolean;
}

const STAY_KEY = 'stay';

function length(a: Coord, b: Coord): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
}

/** A boat crossing as a gentle curve (a quadratic arc bowed 18% to one side), 25 points. */
export function boatArc(from: Coord, to: Coord): Coord[] {
  const mid: Coord = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const control: Coord = [mid[0] - (to[1] - from[1]) * 0.18, mid[1] + (to[0] - from[0]) * 0.18];
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const u = 1 - t;
    return [
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ] as Coord;
  });
}

export interface Leg {
  readonly mode: LegMode;
  readonly path: readonly Coord[];
}

/** The day's legs: from the stay, stop to stop, and back to the stay. */
export function dayLegs(day: MapDay, stay: Coord | null): Leg[] {
  const points = day.stops.map((stop) => ({
    key: stop.legKey ?? stop.id,
    at: [stop.lng, stop.lat] as Coord,
  }));
  const ends =
    stay === null || points.length === 0
      ? points
      : [{ key: STAY_KEY, at: stay }, ...points, { key: STAY_KEY, at: stay }];
  const legs: Leg[] = [];
  for (let index = 1; index < ends.length; index += 1) {
    const from = ends[index - 1];
    const to = ends[index];
    if (from === undefined || to === undefined) continue;
    const key = `${from.key}>${to.key}`;
    const mode = day.legModes?.get(key) ?? 'car';
    const road = day.legPaths?.get(key);
    const path =
      mode === 'boat'
        ? boatArc(from.at, to.at)
        : road !== undefined && road.length >= 2
          ? road
          : [from.at, to.at];
    legs.push({ mode, path });
  }
  return legs;
}

/** The legs cut at `progress` (0 to 1) of their whole length, for the trace. */
export function traceLegs(legs: readonly Leg[], progress: number): Leg[] {
  if (progress >= 1) return [...legs];
  const lengths = legs.map((leg) =>
    leg.path.slice(1).reduce((sum, point, i) => sum + length(leg.path[i] ?? point, point), 0),
  );
  let budget = Math.max(0, progress) * lengths.reduce((sum, value) => sum + value, 0);
  const traced: Leg[] = [];
  for (const [index, leg] of legs.entries()) {
    const total = lengths[index] ?? 0;
    if (budget >= total) {
      traced.push(leg);
      budget -= total;
      continue;
    }
    const path: Coord[] = [leg.path[0] as Coord];
    for (let i = 1; i < leg.path.length && budget > 0; i += 1) {
      const from = leg.path[i - 1] as Coord;
      const to = leg.path[i] as Coord;
      const step = length(from, to);
      if (budget >= step) {
        path.push(to);
        budget -= step;
      } else {
        const t = step === 0 ? 0 : budget / step;
        path.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
        budget = 0;
      }
    }
    if (path.length >= 2) traced.push({ mode: leg.mode, path });
    break;
  }
  return traced;
}

export interface PlanMapFeatures {
  readonly legs: FeatureCollection<LineString, LegProperties>;
  readonly pins: FeatureCollection<Point, PinProperties>;
}

/**
 * Features for the map: `chosenDayNo` null shows every day as dots (the whole trip); `faded`
 * names stops a filter chip leaves out; `progress` traces the chosen day's route.
 */
export function planMapFeatures(input: {
  readonly days: readonly MapDay[];
  readonly chosenDayNo: number | null;
  readonly stay: Coord | null;
  readonly progress?: number;
  readonly faded?: ReadonlySet<string>;
}): PlanMapFeatures {
  const legs: Feature<LineString, LegProperties>[] = [];
  const pins: Feature<Point, PinProperties>[] = [];
  const faded = input.faded ?? new Set<string>();
  // The chosen day last so its pins draw over the dots.
  const ordered = [...input.days].sort(
    (a, b) => Number(a.dayNo === input.chosenDayNo) - Number(b.dayNo === input.chosenDayNo),
  );
  for (const day of ordered) {
    const chosen = day.dayNo === input.chosenDayNo;
    const colours = dayColours(day.dayNo);
    if (chosen) {
      for (const leg of traceLegs(dayLegs(day, input.stay), input.progress ?? 1)) {
        legs.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: leg.path.map((c) => [c[0], c[1]]) },
          properties: { color: colours.route, mode: leg.mode },
        });
      }
    }
    for (const stop of day.stops) {
      pins.push({
        type: 'Feature',
        id: stop.id,
        geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
        properties: {
          id: stop.id,
          label: String(stop.n),
          color: chosen ? colours.route : colours.fill,
          kind: chosen ? 'pin' : 'dot',
          faded: faded.has(stop.id),
        },
      });
    }
  }
  return {
    legs: { type: 'FeatureCollection', features: legs },
    pins: { type: 'FeatureCollection', features: pins },
  };
}
