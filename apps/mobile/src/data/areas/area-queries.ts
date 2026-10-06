/**
 * The synced rows a trip's areas are read from: the public switch, the trip's own destination, its
 * stops in order, the days of the version the reader sees (each with the area it is spent in) and
 * the names of the destinations this phone holds.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const TRIP_AREAS_KEY = 'trip.areas';

export const AREAS_SWITCH_SQL = 'SELECT value FROM client_config WHERE key = ?';
export const AREAS_SWITCH_TABLES = ['client_config'];

export const AREA_TRIP_SQL = `SELECT t.destination_id, d.name AS destination_name
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;
export const AREA_TRIP_TABLES = ['trips', 'destinations'];

export interface AreaTripRow {
  readonly destination_id: string | null;
  readonly destination_name: string | null;
}

export const STOPS_SQL = `SELECT s.position, s.destination_id, s.nights, d.name
  FROM trip_stops s LEFT JOIN destinations d ON d.id = s.destination_id
  WHERE s.trip_id = ? ORDER BY s.position`;
export const STOPS_TABLES = ['trip_stops', 'destinations'];

export interface StopRow {
  readonly position: number;
  readonly destination_id: string;
  readonly nights: number;
  readonly name: string | null;
}

/** The days of the crew's plan, else of the organiser's own draft (a member holds no draft). */
export const AREA_DAYS_SQL = `SELECT d.id, d.day_no, d.date, d.destination_id, a.name AS area_name
  FROM plan_days d
  JOIN trips t ON t.id = d.trip_id
  LEFT JOIN destinations a ON a.id = d.destination_id
  WHERE t.id = ? AND d.version_id = coalesce(t.current_version_id, t.draft_version_id)
  ORDER BY d.day_no`;
export const AREA_DAYS_TABLES = ['plan_days', 'trips', 'destinations'];

export interface AreaDayRow {
  readonly id?: string | null;
  readonly day_no: number;
  readonly date?: string | null;
  readonly destination_id?: string | null | undefined;
  /** The area's name when its row is on this phone. */
  readonly area_name?: string | null;
}

/** A config value as synced: JSON text (`true`), or the bare word. */
export function switchOn(rows: readonly { readonly value: string | null }[]): boolean {
  const value = rows[0]?.value;
  if (value == null) return false;
  try {
    return JSON.parse(value) === true;
  } catch {
    return value === 'true';
  }
}
