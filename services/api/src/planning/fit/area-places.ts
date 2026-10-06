/**
 * Places by the area a day is spent in. On a trip of several areas (a day trip, several stops) a
 * place belongs to one of them: of the trip's areas whose place box holds it (or that own it), the
 * smallest, so a day-trip area claims what lies inside its city's box too. Readers that offer
 * places for a day (gap ideas, nearby, a too-far day's swaps) take them from that area only.
 */
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** SQL for the trip area the place `alias` lies in (null when none holds it). */
export const placeAreaSql = (alias: string, trip: string): string => `(
  SELECT d.id FROM app.trip_area_ids(${trip}, true) AS a(id) JOIN destinations d ON d.id = a.id
   WHERE ST_Intersects(${alias}.location, d.place_bounds) OR ${alias}.destination_id = d.id
   ORDER BY ST_Intersects(${alias}.location, d.place_bounds) DESC NULLS LAST,
            ST_Area(d.place_bounds) NULLS LAST, d.id
   LIMIT 1)`;

/** The area to take places from; `null` = the trip's one destination, read as before. */
export interface AreaScope {
  readonly tripId: string;
  readonly areaId: string;
}

export function areaScope(
  tripId: string | null | undefined,
  areaId: string | null | undefined,
): AreaScope | null {
  return tripId == null || areaId == null ? null : { tripId, areaId };
}

/**
 * The condition that keeps a reader's places to its destination (`destination`, a parameter) or,
 * with a scope, to the area that parameter names within the trip (`trip`, a parameter).
 */
export function placesOfSql(
  alias: string,
  params: { readonly destination: string; readonly trip: string },
  scope: AreaScope | null,
): string {
  if (scope === null) return `${alias}.destination_id = ${params.destination}`;
  return `((${alias}.destination_id = ${params.destination} OR ST_Intersects(${alias}.location,
      (SELECT b.place_bounds FROM destinations b WHERE b.id = ${params.destination})))
    AND ${placeAreaSql(alias, params.trip)} = ${params.destination})`;
}

/**
 * Runs an area-scoped read as the system: place boxes are not the traveller's to read, and the
 * caller already checked the trip. Without a scope the read runs as the caller, as before.
 */
export function readingArea<T>(
  tx: pg.PoolClient,
  scope: AreaScope | null,
  fn: () => Promise<T>,
): Promise<T> {
  return scope === null ? fn() : asSystemRole(tx, fn);
}
