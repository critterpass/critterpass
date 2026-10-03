/**
 * Local queries for the plan screens. The trip's current version is the group plan every day
 * reads; queued plan edits and proposals (still in the local command queue) are read back so the
 * day shows them before the server has answered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

/** The trip's zone is its own, else its destination's (most trips leave their own empty). */
export const TRIP_SQL = `SELECT t.id, t.crew_id, coalesce(t.tz, d.tz) AS tz, t.current_version_id,
    t.destination_id, t.start_date, t.status, p.role, g.slug AS guide_slug
  FROM trips t LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'trip_participants', 'guides', 'destinations'];

export interface TripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly tz: string | null;
  readonly current_version_id: string | null;
  readonly destination_id: string | null;
  readonly start_date: string | null;
  readonly status: string | null;
  readonly role: string | null;
  readonly guide_slug: string | null;
}

/** Active crew members in join order (their join index picks their colour), with names. */
export const MEMBERS_SQL = `SELECT m.user_id, m.role, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? AND m.status = 'active'
  ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export interface MemberRow {
  readonly user_id: string;
  readonly role: string | null;
  readonly display_name: string | null;
}

export const DAYS_SQL = `SELECT day_no, date, theme, i18n FROM plan_days
  WHERE version_id = ? ORDER BY day_no`;
export const DAYS_TABLES = ['plan_days'];

export const ITEMS_SQL = `SELECT i.stable_id, d.day_no, i.starts_at, i.ends_at, i.tz, i.lane,
    i.attendee_ids, i.poi_id, i.booking_id, i.must_do_id, i.category, i.cost_model,
    i.amount_minor, i.currency, i.status, i.is_outdoor, i.created_by_kind, i.notes,
    i.locked_reason, i.i18n, p.name AS poi_name, p.lat AS poi_lat, p.lng AS poi_lng
  FROM plan_items i JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.version_id = ?
  ORDER BY i.starts_at, i.stable_id`;
export const ITEMS_TABLES = ['plan_items', 'plan_days', 'pois'];

/** The version's own record of the places it plans (their names, for items to go by). */
export const VERSION_PLACES_SQL = `SELECT coverage, (SELECT json_group_object(substr(id, 12),
    json_extract(value, '$.name')) FROM local_state WHERE id LIKE 'plan_place:%') AS picked
  FROM itinerary_versions WHERE id = ?`;
export const VERSION_PLACES_TABLES = ['itinerary_versions', 'local_state'];

/** Plan edits and proposals still in the local queue, oldest first. */
export const QUEUED_PLAN_SQL = `SELECT id, cmd, envelope, status FROM commands
  WHERE cmd IN ('apply_plan_ops', 'create_changeset') ORDER BY seq`;
export const QUEUED_PLAN_TABLES = ['commands'];

export interface QueuedRow {
  readonly id: string;
  readonly cmd: string;
  readonly envelope: string;
  readonly status: string;
}

/** Change sets still waiting on the crew (or on their author) for this trip. */
export const OPEN_CHANGESETS_SQL = `SELECT id, trigger, status, author_kind, author_id, ops, poll_id,
    base_version_id, created_at
  FROM change_sets
  WHERE trip_id = ? AND scope = 'group' AND status IN ('draft', 'proposed', 'voting')
  ORDER BY created_at DESC`;
export const CHANGESETS_TABLES = ['change_sets'];

export interface ChangesetRow {
  readonly id: string;
  readonly trigger: string | null;
  readonly status: string;
  readonly author_kind: string | null;
  readonly author_id: string | null;
  readonly ops: string | null;
  readonly poll_id: string | null;
  readonly base_version_id: string | null;
  readonly created_at: string | null;
}

export const WEATHER_SQL = `SELECT hourly, fetched_at FROM weather_snapshots
  WHERE destination_id = ? AND date = ? ORDER BY fetched_at DESC LIMIT 1`;
export const WEATHER_TABLES = ['weather_snapshots'];

/** Places for "add to the day": curated places of the destination matching the query. */
/**
 * The destination's places on the phone, for the add sheet to search: matched in code, so a place
 * typed without its accents ("My Son") still finds "Mỹ Sơn Sanctuary".
 */
export const DESTINATION_PLACES_SQL = `SELECT id, name, name_local, category, lat, lng FROM pois
  WHERE destination_id = ? AND status = 'active'`;
export const SAVED_PLACES_SQL = `SELECT p.id, p.name, p.category, p.lat, p.lng
  FROM saved_items s JOIN pois p ON p.id = s.ref_id
  WHERE s.kind = 'place' AND p.destination_id = ? ORDER BY s.created_at DESC LIMIT 30`;
export const PLACES_TABLES = ['pois', 'saved_items'];

export interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}
