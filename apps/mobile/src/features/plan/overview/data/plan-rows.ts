/**
 * Local reads beside the plan (`@/data/plan` reads the trip, days, items and crew): open decision
 * polls, the forecast row's shape the plan fixtures use, and JSON array columns as SQLite holds
 * them. The queries run against the device database and re-run whenever one of their tables
 * changes.
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
