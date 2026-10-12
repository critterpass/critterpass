/**
 * The plan's days as the premium map draws them: each day's placed stops numbered as the day
 * lists them, along the roads of their synced legs, with how the chosen day's legs are travelled
 * (walks dotted, boats as arcs) and, while a stop is held, the order the drag would leave. Also
 * the points the camera frames.
 */
import type { DayLeg } from '@/data/legs/day-legs';
import type { LegPaths } from '@/data/legs/version-leg-paths';

import type { TripDay } from '../../trip-map/trip-days';
import type { Coord, LegMode, MapDay } from '../map';

function legModeOf(mode: DayLeg['mode']): LegMode {
  if (mode === 'walk') return 'walk';
  if (mode === 'boat') return 'boat';
  return 'car';
}

export function mapDays(input: {
  readonly days: readonly TripDay[];
  readonly legPaths?: LegPaths | undefined;
  /** The chosen day's legs, for their modes. */
  readonly chosenLegs?: readonly DayLeg[] | undefined;
  readonly chosenDayNo: number | null;
  /** The chosen day's stops in the order a held stop would leave them. */
  readonly order?: readonly string[] | null | undefined;
}): MapDay[] {
  const modes = new Map<string, LegMode>(
    (input.chosenLegs ?? []).map((leg) => [`${leg.from}>${leg.to}`, legModeOf(leg.mode)]),
  );
  return input.days.map((day) => {
    const chosen = day.dayNo === input.chosenDayNo;
    const ordered =
      chosen && input.order != null
        ? input.order.flatMap((id) => day.stops.filter((stop) => stop.stableId === id))
        : day.stops;
    return {
      dayNo: day.dayNo,
      ...(input.legPaths === undefined ? {} : { legPaths: input.legPaths }),
      ...(chosen ? { legModes: modes } : {}),
      stops: ordered.flatMap((stop, index) =>
        stop.place === null
          ? []
          : [{ id: stop.stableId, n: index + 1, lat: stop.place.lat, lng: stop.place.lng }],
      ),
    };
  });
}

/**
 * What the camera frames: the chosen day's stops and its stay; with no day chosen (the whole trip)
 * the stops of the first city's days; an empty plan, the saved places or the destination.
 */
export function framePoints(input: {
  readonly days: readonly TripDay[];
  readonly chosen: TripDay | null;
  readonly saved: readonly Coord[];
  readonly center: Coord | null;
}): Coord[] {
  const days =
    input.chosen === null
      ? input.days.filter((day) => day.area === undefined && day.laterStop === undefined)
      : [input.chosen];
  const stops = days.flatMap((day) =>
    day.stops.flatMap((stop) =>
      stop.place === null ? [] : [[stop.place.lng, stop.place.lat] as Coord],
    ),
  );
  const stay = input.chosen?.stay ?? null;
  if (stops.length > 0) return stay === null ? stops : [...stops, [stay.lng, stay.lat]];
  if (input.saved.length > 0) return [...input.saved];
  return input.center === null ? [] : [input.center];
}

/** The bounds around points, `[west, south, east, north]`; a single point gets a little room. */
export function boundsOf(points: readonly Coord[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const pad = west === east && south === north ? 0.005 : 0;
  return [west - pad, south - pad, east + pad, north + pad];
}
