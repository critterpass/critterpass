/**
 * A day's route as the plan check counts it: the stops that have a place, in start order, from the
 * night's stay and back to it, with only the legs driven summed ("in the car"). The too-far rule,
 * the reorder and the swaps all count driving this way, so their numbers agree.
 */
import type { FitPoint, FitStop, FitTravel } from '../fit/context';

export interface RouteStop {
  readonly stableId: string;
  readonly point: FitPoint | null;
  readonly start: number;
}

/** Drive minutes of one leg; a walk or an unknown leg is no time in the car. */
export function driveLeg(travel: FitTravel, from: FitStop | null, to: FitStop | null): number {
  if (from === null || to === null) return 0;
  const leg = travel(from, to);
  return leg !== null && leg.mode === 'drive' ? leg.minutes : 0;
}

export function stopOf(stop: RouteStop): FitStop | null {
  return stop.point === null ? null : { key: stop.stableId, ...stop.point };
}

export function stayStop(stay: FitPoint | null): FitStop | null {
  return stay === null ? null : { key: 'stay', ...stay };
}

/** Drive minutes of the day: stay, every stop with a place by start, back to the stay. */
export function routeDrive(
  stops: readonly RouteStop[],
  stay: FitPoint | null,
  travel: FitTravel,
): number {
  const route = stops
    .filter((stop) => stop.point !== null)
    .sort((a, b) => a.start - b.start || (a.stableId < b.stableId ? -1 : 1))
    .map(stopOf);
  if (route.length === 0) return 0;
  const home = stayStop(stay);
  let drive = driveLeg(travel, home, route[0] ?? null);
  for (let index = 1; index < route.length; index += 1) {
    drive += driveLeg(travel, route[index - 1] ?? null, route[index] ?? null);
  }
  return drive + driveLeg(travel, route[route.length - 1] ?? null, home);
}
