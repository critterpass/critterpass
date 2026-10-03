/**
 * The local reads every plan surface shares: the trip (with my role and the version I see), the
 * version's days and items (each item labelled by its place, booking or note), open decision polls,
 * the destination's centroid forecast, and applied guide change sets. All synced rows; the queries
 * run against the device database and re-run whenever one of their tables changes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */

export const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const UID_TABLES = ['local_state'];

export interface PlanTripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly phase: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly current_version_id: string | null;
  readonly draft_version_id: string | null;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
  readonly guide_id: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  readonly local_currency: string | null;
  readonly my_role: string | null;
  readonly my_rsvp: string | null;
}

export const TRIP_SQL = `SELECT t.id, t.crew_id, t.status, t.phase, t.start_date, t.end_date,
    coalesce(t.tz, d.tz) AS tz, t.current_version_id, t.draft_version_id, t.destination_id,
    d.name AS destination_name, d.slug AS destination_slug, t.guide_id, g.slug AS guide_slug,
    g.name AS guide_name, t.local_currency, p.role AS my_role, p.rsvp AS my_rsvp
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'destinations', 'guides', 'trip_participants'];

export interface PlanDayRow {
  readonly id: string;
  readonly day_no: number;
  readonly date: string | null;
  readonly theme: string | null;
  /** The guide's text in other languages (JSON text); read through `guideText`. */
  readonly i18n?: string | null;
}

export const DAYS_SQL = `SELECT id, day_no, date, theme, i18n FROM plan_days
  WHERE version_id = ? ORDER BY day_no`;
export const DAYS_TABLES = ['plan_days'];

export interface PlanItemRow {
  readonly id: string;
  readonly stable_id: string;
  readonly day_no: number;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly tz: string | null;
  readonly lane: string | null;
  readonly attendee_ids: string | null;
  readonly poi_id: string | null;
  readonly booking_id: string | null;
  readonly must_do_id: string | null;
  readonly category: string | null;
  readonly cost_model: string | null;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly is_outdoor: number | null;
  readonly created_by_kind: string | null;
  readonly notes: string | null;
  readonly locked_reason: string | null;
  readonly i18n?: string | null;
  readonly poi_name: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly booking_title: string | null;
}

export const ITEMS_SQL = `SELECT pi.id, pi.stable_id, d.day_no, pi.starts_at, pi.ends_at, pi.tz,
    pi.lane, pi.attendee_ids, pi.poi_id, pi.booking_id, pi.must_do_id, pi.category, pi.cost_model,
    pi.amount_minor, pi.currency, pi.status, pi.is_outdoor, pi.created_by_kind, pi.notes,
    pi.locked_reason, pi.i18n, p.name AS poi_name, p.lat, p.lng, b.title AS booking_title
  FROM plan_items pi
  JOIN plan_days d ON d.id = pi.day_id
  LEFT JOIN pois p ON p.id = pi.poi_id
  LEFT JOIN bookings b ON b.id = pi.booking_id AND b.deleted_at IS NULL AND b.status <> 'cancelled'
  WHERE pi.version_id = ?
  ORDER BY d.day_no, pi.starts_at, pi.stable_id`;
export const ITEMS_TABLES = ['plan_items', 'plan_days', 'pois', 'bookings'];

/** The version's own record of the places it plans (their names, for stops to go by). */
export const VERSION_PLACES_SQL = `SELECT coverage, (SELECT json_group_object(substr(id, 12),
    json_extract(value, '$.name')) FROM local_state WHERE id LIKE 'plan_place:%') AS picked
  FROM itinerary_versions WHERE id = ?`;
export const VERSION_PLACES_TABLES = ['itinerary_versions', 'local_state'];

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

export interface MemberRow {
  readonly user_id: string;
  readonly display_name: string | null;
}

/** The crew in join order: the join index picks each member's colour. */
export const MEMBERS_SQL = `SELECT m.user_id, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

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
