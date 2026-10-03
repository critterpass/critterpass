/**
 * The overview's own local reads beside the plan (`@/data/plan` reads the trip, days, items and
 * crew): open decision polls, the destination's centroid forecast, and applied guide change sets.
 * All synced rows; the queries run against the device database and re-run whenever one of their
 * tables changes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */

export interface OpenPollRow {
  readonly id: string;
  readonly ref_id: string | null;
  readonly ballots: number;
}

/** Open decision polls on the trip, one row per option, with the ballots cast so far. */
export const POLLS_SQL = `SELECT p.id, o.ref_id,
    (SELECT count(*) FROM ballots b WHERE b.poll_id = p.id) AS ballots
  FROM polls p JOIN poll_options o ON o.poll_id = p.id
  WHERE p.trip_id = ? AND p.status = 'open' AND p.kind IN ('day_option', 'decision')`;
export const POLLS_TABLES = ['polls', 'poll_options', 'ballots'];

export interface WeatherRow {
  readonly date: string;
  readonly hourly: string;
  readonly marine: string | null;
}

export const WEATHER_SQL = `SELECT date, hourly, marine FROM weather_snapshots
  WHERE destination_id = ? AND point_key = 'centroid'`;
export const WEATHER_TABLES = ['weather_snapshots'];

export interface GuideChangeRow {
  readonly id: string;
  readonly ops: string | null;
  readonly updated_at: string | null;
}

export const GUIDE_CHANGES_SQL = `SELECT id, ops, updated_at FROM change_sets
  WHERE trip_id = ? AND author_kind = 'guide' AND status = 'applied'
  ORDER BY updated_at DESC LIMIT 20`;
export const GUIDE_CHANGES_TABLES = ['change_sets'];

/** `local_state` key holding the newest guide change this device has swept on the plan. */
export function guideSeenKey(tripId: string): string {
  return `plan.guide_seen.${tripId}`;
}

export const SEEN_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const SEEN_TABLES = ['local_state'];

/** A JSON array column (`attendee_ids`, `ops`) as read from SQLite; malformed → []. */
export function jsonArray<T>(value: string | null): T[] {
  if (value === null || value === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** A uuid[] column: JSON text, or a Postgres array literal `{a,b}` from older sync payloads. */
export function idArray(value: string | null): string[] {
  if (value === null || value === '') return [];
  if (value.startsWith('{')) {
    return value
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .filter((id) => id.length > 0);
  }
  return jsonArray<unknown>(value).filter((id): id is string => typeof id === 'string');
}
