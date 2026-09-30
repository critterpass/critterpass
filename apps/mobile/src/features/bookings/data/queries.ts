/**
 * The local queries the wallet reads. Bookings, flight legs, import candidates and the crew's
 * forward address are synced rows; barcodes, cached documents and policies live in the
 * local-only `local_private` table, so every wallet screen renders in airplane mode.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */

export const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const UID_TABLES = ['local_state'];

export const PROFILE_SQL = `SELECT u.display_name, u.home_currency, s.active_crew_id
  FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`;
export const PROFILE_TABLES = ['users', 'user_settings'];

export const CREWS_SQL = `SELECT c.id, c.name, c.settlement_currency, m.role
  FROM crew_members m JOIN crews c ON c.id = m.crew_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at, c.id`;
export const CREWS_TABLES = ['crews', 'crew_members'];

export const MEMBERS_SQL = `SELECT m.user_id, m.status, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export const TRIPS_SQL = `SELECT t.id, t.status, t.start_date, t.end_date, coalesce(t.tz, d.tz) AS tz,
    d.name AS destination_name
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.crew_id = ? AND t.status <> 'cancelled'
  ORDER BY t.start_date DESC, t.id`;
export const TRIPS_TABLES = ['trips', 'destinations'];

export const PARTICIPANTS_SQL = `SELECT user_id FROM trip_participants
  WHERE trip_id = ? AND coalesce(holds_seat, 1) = 1 ORDER BY created_at, user_id`;
export const PARTICIPANTS_TABLES = ['trip_participants'];

export const BOOKINGS_SQL = `SELECT id, trip_id, owner_id, type, title, starts_at, ends_at, tz,
    location, traveller_ids, price_minor, currency, paid_by, source, supplier, supplier_ref,
    free_cancel_until, cancel_policy_text, status, visibility, flight_crew_visible, details,
    barcode_format, version
  FROM bookings WHERE trip_id = ? AND deleted_at IS NULL
  ORDER BY coalesce(starts_at, created_at), id`;
export const BOOKINGS_TABLES = ['bookings'];

export const SEGMENTS_SQL = `SELECT id, booking_id, owner_id, crew_visible, segment_no, carrier,
    flight_no, dep_airport, arr_airport, sched_dep_at, sched_arr_at, est_dep_at, est_arr_at,
    act_dep_at, act_arr_at, boarding_at, boarding_estimated, gate, terminal, status, delay_min,
    status_source, status_at
  FROM flight_segments WHERE trip_id = ? ORDER BY booking_id, segment_no`;
export const SEGMENTS_TABLES = ['flight_segments'];

export const ATTACHMENTS_SQL = `SELECT id, booking_id, media_key, kind FROM booking_attachments
  WHERE trip_id = ?`;
export const ATTACHMENTS_TABLES = ['booking_attachments'];

/** The member's own candidates and the crew-visible ones, unresolved, newest first. */
export const CANDIDATES_SQL = `SELECT id, user_id, crew_id, trip_id, source, extracted, status,
    crew_visible, needs_confirm, failure_reason, duplicate_of_id, created_at
  FROM import_candidates
  WHERE status IN ('parsing', 'pending', 'failed', 'duplicate')
    AND (user_id = ?1 OR (crew_id = ?2 AND crew_visible = 1))
    AND (trip_id IS NULL OR trip_id = ?3)
  ORDER BY created_at DESC, id`;
export const CANDIDATES_TABLES = ['import_candidates'];

export const INBOUND_SQL = `SELECT local_part FROM crew_inbound_addresses
  WHERE crew_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`;
export const INBOUND_TABLES = ['crew_inbound_addresses'];

export const PASS_PLUS_SQL = 'SELECT pass_plus FROM user_entitlements WHERE user_id = ?';
export const PASS_PLUS_TABLES = ['user_entitlements'];

export const PRIVATE_BY_KIND_SQL = 'SELECT id, data FROM local_private WHERE kind = ?';
export const PRIVATE_TABLES = ['local_private'];

export const FX_RUN_SQL = `SELECT id, base, quote FROM fx_snapshots
  WHERE (as_of, source) = (
    SELECT s.as_of, s.source FROM fx_snapshots s
     WHERE (s.base = ?1 OR s.quote = ?1)
       AND EXISTS (SELECT 1 FROM fx_snapshots o WHERE o.as_of = s.as_of AND o.source = s.source
                     AND (o.base = ?2 OR o.quote = ?2))
     ORDER BY s.as_of DESC, s.id LIMIT 1)
  ORDER BY id`;
export const FX_TABLES = ['fx_snapshots'];

export interface CrewRow {
  readonly id: string;
  readonly name: string | null;
  readonly settlement_currency: string | null;
  readonly role: string;
}

export interface MemberRow {
  readonly user_id: string;
  readonly status: string;
  readonly display_name: string | null;
}

export interface TripRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly destination_name: string | null;
}

export interface BookingRow {
  readonly id: string;
  readonly trip_id: string;
  readonly owner_id: string;
  readonly type: string;
  readonly title: string;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly tz: string | null;
  readonly location: string | null;
  /** JSON array of user ids. */
  readonly traveller_ids: string | null;
  readonly price_minor: number | null;
  readonly currency: string | null;
  readonly paid_by: string | null;
  readonly source: string;
  readonly supplier: string | null;
  readonly supplier_ref: string | null;
  readonly free_cancel_until: string | null;
  readonly cancel_policy_text: string | null;
  readonly status: string;
  readonly visibility: string;
  readonly flight_crew_visible: number | null;
  /** JSON object (`bookingDetailsSchema`). */
  readonly details: string | null;
  readonly barcode_format: string | null;
  readonly version: number;
}

export interface SegmentRow {
  readonly id: string;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly crew_visible: number | null;
  readonly segment_no: number;
  readonly carrier: string;
  readonly flight_no: string;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly sched_dep_at: string;
  readonly sched_arr_at: string | null;
  readonly est_dep_at: string | null;
  readonly est_arr_at: string | null;
  readonly act_dep_at: string | null;
  readonly act_arr_at: string | null;
  readonly boarding_at: string | null;
  readonly boarding_estimated: number | null;
  readonly gate: string | null;
  readonly terminal: string | null;
  readonly status: string;
  readonly delay_min: number | null;
  readonly status_source: string | null;
  readonly status_at: string | null;
}

export interface AttachmentRow {
  readonly id: string;
  readonly booking_id: string;
  readonly media_key: string;
  readonly kind: string;
}

export interface CandidateRow {
  readonly id: string;
  readonly user_id: string;
  readonly crew_id: string | null;
  readonly trip_id: string | null;
  readonly source: string;
  /** JSON (`extractedBookingSchema`), null while parsing. */
  readonly extracted: string | null;
  readonly status: string;
  readonly crew_visible: number | null;
  readonly needs_confirm: number | null;
  readonly failure_reason: string | null;
  readonly duplicate_of_id: string | null;
  readonly created_at: string;
}

export interface FxRow {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
}

/** Parses a JSON column, answering `fallback` for null or unreadable text. */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
