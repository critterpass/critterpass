/**
 * The day routes `StopRouteLayer` draws: numbered stops in the day's colour joined by straight
 * segments from the stay and back, the chosen day at full strength and the others at half (7a-1).
 * Picking a day traces its route out from the stay (`traceLine`).
 */
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export type Coord = readonly [number, number];

export interface RouteStop {
  readonly id: string;
  /** The number on the stop: its order in the day. */
  readonly n: number;
  readonly lat: number;
  readonly lng: number;
}

export interface RouteDay {
  readonly dayNo: number;
  readonly color: string;
  readonly stops: readonly RouteStop[];
}

/** Strength of the days that are not the chosen one (7a-1). */
export const OTHER_DAY_OPACITY = 0.5;

function segmentLength(a: Coord, b: Coord): number {
  // Planar distance with longitude shrunk by latitude: exact enough to pace an animation.
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
}

/**
 * The first `progress` (0 to 1) of a polyline by length, always two points or more so it is a
 * valid line (a zero progress is the first point twice).
 */
export function traceLine(coords: readonly Coord[], progress: number): Coord[] {
  const first = coords[0];
  if (first === undefined) return [];
  if (progress >= 1 || coords.length < 2) return coords.length < 2 ? [first, first] : [...coords];
  const lengths = coords
    .slice(1)
    .map((point, index) => segmentLength(coords[index] ?? point, point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = Math.max(0, progress) * total;
  const traced: Coord[] = [first];
  for (let index = 1; index < coords.length; index += 1) {
    const from = coords[index - 1] ?? first;
    const to = coords[index] ?? from;
    const length = lengths[index - 1] ?? 0;
    if (remaining >= length) {
      traced.push(to);
      remaining -= length;
      if (remaining <= 0 && traced.length >= 2) break;
      continue;
    }
    const t = length === 0 ? 0 : remaining / length;
    traced.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    break;
  }
  return traced.length < 2 ? [first, first] : traced;
}

export interface RouteLineProperties {
  readonly color: string;
  readonly opacity: number;
  readonly chosen: boolean;
}

export interface RouteStopProperties {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly opacity: number;
  readonly chosen: boolean;
}

/** A day's path: the stay, its stops in order, back to the stay. */
export function dayPath(day: RouteDay, stay: Coord | null): Coord[] {
  const stops = day.stops.map((stop): Coord => [stop.lng, stop.lat]);
  return stay === null || stops.length === 0 ? stops : [stay, ...stops, stay];
}

/**
 * The line and stop features for every day. `chosenDayNo` null draws every day at full strength
 * (the whole trip); `progress` traces the chosen day's line out from its start.
 */
export function routeFeatures(
  days: readonly RouteDay[],
  chosenDayNo: number | null,
  stay: Coord | null,
  progress = 1,
): {
  readonly lines: FeatureCollection<LineString, RouteLineProperties>;
  readonly stops: FeatureCollection<Point, RouteStopProperties>;
} {
  const lines: Feature<LineString, RouteLineProperties>[] = [];
  const stops: Feature<Point, RouteStopProperties>[] = [];
  // The chosen day last, so it draws over the others.
  const ordered = [...days].sort(
    (a, b) => Number(a.dayNo === chosenDayNo) - Number(b.dayNo === chosenDayNo),
  );
  for (const day of ordered) {
    const chosen = chosenDayNo === null || day.dayNo === chosenDayNo;
    const opacity = chosen ? 1 : OTHER_DAY_OPACITY;
    const path = dayPath(day, stay);
    if (path.length >= 2) {
      const coordinates = day.dayNo === chosenDayNo ? traceLine(path, progress) : path;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coordinates.map((c) => [c[0], c[1]]) },
        properties: { color: day.color, opacity, chosen },
      });
    }
    for (const stop of day.stops) {
      stops.push({
        type: 'Feature',
        id: stop.id,
        geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
        properties: { id: stop.id, label: String(stop.n), color: day.color, opacity, chosen },
      });
    }
  }
  return {
    lines: { type: 'FeatureCollection', features: lines },
    stops: { type: 'FeatureCollection', features: stops },
  };
}
