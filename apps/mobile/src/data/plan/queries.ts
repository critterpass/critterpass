/**
 * The local reads every plan surface shares: the trip (with my role, the version I see and its
 * zone), the crew, a version's days and items (each item with its place and booking), the
 * version's own place names, my queued plan edits and proposals, and the trip's open change sets.
 * All synced rows (or the local command queue); each query re-runs when one of its tables changes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const UID_TABLES = ['local_state'];

/**
 * The trip as the plan reads it. Its zone is its own, else its destination's (most trips leave
 * their own empty). `role` and `my_role` are the same column under the names the day view and
 * the overview read.
 */
export const TRIP_SQL = `SELECT t.id, t.crew_id, t.status, t.phase, t.start_date, t.end_date,
    coalesce(t.tz, d.tz) AS tz, t.current_version_id, t.draft_version_id, t.destination_id,
    d.name AS destination_name, d.slug AS destination_slug, t.guide_id, g.slug AS guide_slug,
    g.name AS guide_name, t.local_currency, p.role AS role, p.role AS my_role, p.rsvp AS my_rsvp
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'destinations', 'guides', 'trip_participants'];

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
  readonly role: string | null;
  readonly my_role: string | null;
  readonly my_rsvp: string | null;
}

/** The crew in join order (the join index picks each member's colour), active or not. */
export const MEMBERS_SQL = `SELECT m.user_id, m.role, m.status, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export interface MemberRow {
  readonly user_id: string;
  readonly role: string | null;
  readonly status: string | null;
  readonly display_name: string | null;
}

export const DAYS_SQL = `SELECT id, day_no, date, theme, i18n FROM plan_days
  WHERE version_id = ? ORDER BY day_no`;
export const DAYS_TABLES = ['plan_days'];

export interface PlanDayRow {
  readonly id: string;
  readonly day_no: number;
  readonly date: string | null;
  readonly theme: string | null;
  /** The guide's text in other languages (JSON text); read through `guideText`. */
  readonly i18n?: string | null;
}

/** A version's items with their place (named and placed) and live booking's title. */
export const ITEMS_SQL = `SELECT pi.id, pi.stable_id, d.day_no, pi.starts_at, pi.ends_at, pi.tz,
    pi.lane, pi.attendee_ids, pi.poi_id, pi.booking_id, pi.must_do_id, pi.category, pi.cost_model,
    pi.amount_minor, pi.currency, pi.status, pi.is_outdoor, pi.created_by_kind, pi.notes,
    pi.locked_reason, pi.i18n, p.name AS poi_name, p.lat, p.lng, p.lat AS poi_lat,
    p.lng AS poi_lng, b.title AS booking_title
  FROM plan_items pi
  JOIN plan_days d ON d.id = pi.day_id
  LEFT JOIN pois p ON p.id = pi.poi_id
  LEFT JOIN bookings b ON b.id = pi.booking_id AND b.deleted_at IS NULL AND b.status <> 'cancelled'
  WHERE pi.version_id = ?
  ORDER BY d.day_no, pi.starts_at, pi.stable_id`;
export const ITEMS_TABLES = ['plan_items', 'plan_days', 'pois', 'bookings'];

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
  readonly poi_lat: number | null;
  readonly poi_lng: number | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly booking_title: string | null;
}

/** The version's own record of the places it plans (their names, for stops to go by). */
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
