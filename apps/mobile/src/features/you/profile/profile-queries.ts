/**
 * The local queries the profile reads. Every row is synced, so the profile renders offline; a
 * fresh account has a `users` row and little else, and every join here tolerates that.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */

export const ME_SQL = `SELECT u.display_name, u.username, u.home_airport, u.home_country,
    u.member_since, p.number AS pass_number, a.kind AS avatar_kind, a.form_id AS avatar_form_id,
    a.ring AS avatar_ring, t.tags AS taste_tags, coalesce(e.pass_plus, 0) AS pass_plus
  FROM users u
  LEFT JOIN passes p ON p.user_id = u.id
  LEFT JOIN avatars a ON a.id = u.avatar_id
  LEFT JOIN taste_profiles t ON t.user_id = u.id
  LEFT JOIN user_entitlements e ON e.user_id = u.id
  WHERE u.id = ?`;
export const ME_TABLES = ['users', 'passes', 'avatars', 'taste_profiles', 'user_entitlements'];

export interface MeRow {
  readonly display_name: string | null;
  readonly username: string | null;
  readonly home_airport: string | null;
  readonly home_country: string | null;
  readonly member_since: string | null;
  readonly pass_number: string | null;
  readonly avatar_kind: string | null;
  readonly avatar_form_id: string | null;
  readonly avatar_ring: string | null;
  /** A JSON array of taste tags. */
  readonly taste_tags: string | null;
  readonly pass_plus: number;
}

export const STAMPS_SQL = `SELECT s.id, s.kind, s.seq_no, s.iata, s.country, s.ink_colour, s.status,
    s.stamped_at, s.dates, s.trip_id, d.name AS destination_name, d.colour AS destination_colour,
    t.start_date AS trip_start
  FROM stamps s
  LEFT JOIN destinations d ON d.id = s.destination_id
  LEFT JOIN trips t ON t.id = s.trip_id
  WHERE s.user_id = ? AND s.kind IN ('home', 'trip')
  ORDER BY s.seq_no`;
export const STAMPS_TABLES = ['stamps', 'destinations', 'trips'];

export interface StampRow {
  readonly id: string;
  readonly kind: string;
  readonly seq_no: number;
  readonly iata: string | null;
  readonly country: string | null;
  readonly ink_colour: string | null;
  readonly status: string;
  readonly stamped_at: string | null;
  /** A Postgres daterange as text: `[2024-06-01,2024-06-09)`. */
  readonly dates: string | null;
  readonly trip_id?: string | null;
  readonly destination_name: string | null;
  readonly destination_colour: string | null;
  readonly trip_start: string | null;
}

/** Trips the user went on: answered in, and the trip is under way or over. */
export const HISTORY_TRIPS_SQL = `SELECT t.id, t.start_date, d.country
  FROM trip_participants p
  JOIN trips t ON t.id = p.trip_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE p.user_id = ? AND p.rsvp = 'in' AND t.phase IN ('in', 'post')`;
export const HISTORY_TRIPS_TABLES = ['trip_participants', 'trips', 'destinations'];

export interface HistoryTripRow {
  readonly id: string;
  readonly start_date: string | null;
  readonly country: string | null;
}

export const PAST_TRIPS_SQL = `SELECT id, country, month, place_id FROM past_trips
  WHERE user_id = ? AND deleted_at IS NULL`;
export const PAST_TRIPS_TABLES = ['past_trips'];

export interface PastTripRow {
  readonly id: string;
  readonly country: string;
  readonly month: string;
  readonly place_id: string | null;
}

/** Distinct locals found; forms of one critter count once. */
export const CRITTERS_SQL = `SELECT count(DISTINCT critter_id) AS n FROM collection_entries
  WHERE user_id = ?`;
export const CRITTERS_TABLES = ['collection_entries'];

export const CREWS_SQL = `SELECT c.id, c.name FROM crew_members m JOIN crews c ON c.id = m.crew_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at, c.id`;
export const CREWS_TABLES = ['crews', 'crew_members'];

export interface CrewRow {
  readonly id: string;
  readonly name: string | null;
}

/** Everyone in the user's crews, in joining order (the order member colours follow). */
export const CREW_MEMBERS_SQL = `SELECT m.crew_id, m.user_id, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.status = 'active' AND m.crew_id IN (
    SELECT crew_id FROM crew_members WHERE user_id = ? AND status = 'active')
  ORDER BY m.created_at, m.user_id`;
export const CREW_MEMBERS_TABLES = ['crew_members', 'users'];

export interface CrewMemberRow {
  readonly crew_id: string;
  readonly user_id: string;
  readonly display_name: string | null;
}

export const CREW_TRIPS_SQL = `SELECT t.id, t.crew_id, t.start_date, d.name AS destination_name
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.status <> 'cancelled' AND t.crew_id IN (
    SELECT crew_id FROM crew_members WHERE user_id = ? AND status = 'active')`;
export const CREW_TRIPS_TABLES = ['trips', 'destinations', 'crew_members'];

export interface CrewTripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly start_date: string | null;
  readonly destination_name: string | null;
}
