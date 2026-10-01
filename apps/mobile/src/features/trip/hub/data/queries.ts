/**
 * Local queries the trip hub, the day-of screen and the offline card share: the trip with its
 * destination and guide, and the crew in join order. Every one reads synced rows, so the trip day
 * renders with no signal.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const TRIP_SQL = `SELECT t.id, t.crew_id, t.status, t.start_date, t.end_date,
    coalesce(t.tz, d.tz) AS tz, t.current_version_id, t.destination_id, t.local_currency,
    t.is_guest_guide, d.name AS destination_name, d.slug AS destination_slug, g.slug AS guide_slug, g.name AS guide_name,
    p.countdown_target_at, p.landed_at, p.role
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'destinations', 'guides', 'trip_participants'];

export interface TripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly current_version_id: string | null;
  readonly destination_id: string | null;
  readonly local_currency: string | null;
  readonly is_guest_guide: number | null;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  readonly countdown_target_at: string | null;
  readonly landed_at: string | null;
  readonly role: string | null;
}

/** How many trips the switcher lists for me (every one not archived or cancelled). */
export const MY_TRIP_COUNT_SQL = `SELECT count(*) AS n FROM trips t
  WHERE t.status NOT IN ('archived', 'cancelled')
    AND (t.id IN (SELECT trip_id FROM trip_participants WHERE user_id = ?1)
      OR t.crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = ?1 AND status = 'active'))`;
export const MY_TRIP_COUNT_TABLES = ['trips', 'trip_participants', 'crew_members'];

/** Active crew members in join order (their join index picks their colour), with names. */
export const MEMBERS_SQL = `SELECT m.user_id, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? AND m.status = 'active'
  ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export interface MemberRow {
  readonly user_id: string;
  readonly display_name: string | null;
}

/** Who is going: participants who said they're in. */
export const GOING_SQL = `SELECT user_id FROM trip_participants WHERE trip_id = ? AND rsvp = 'in'`;
export const GOING_TABLES = ['trip_participants'];

/** The day's plan, in time order, with each place's name (current version only). */
export const DAY_ITEMS_SQL = `SELECT i.id, i.stable_id, i.starts_at, i.ends_at, i.tz, i.attendee_ids,
    i.booking_id, i.category, i.notes, i.status, p.name AS poi_name, d.day_no
  FROM plan_items i JOIN plan_days d ON d.id = i.day_id
  LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.version_id = ? AND d.date = ?
  ORDER BY i.starts_at, i.stable_id`;
export const DAY_ITEMS_TABLES = ['plan_items', 'plan_days', 'pois'];

export interface DayItemRow {
  readonly id: string;
  readonly stable_id: string;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly tz: string | null;
  readonly attendee_ids: string | null;
  readonly booking_id: string | null;
  readonly category: string | null;
  readonly notes: string | null;
  readonly status: string | null;
  readonly poi_name: string | null;
  readonly day_no: number | null;
}
