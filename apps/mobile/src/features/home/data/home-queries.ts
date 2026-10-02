/**
 * The local queries Home reads (all synced rows, so Home renders offline) and the pure mappers
 * from their rows to what the screen shows. Pending inbox actions and tip dismissals still in the
 * upload queue already count as done, so an answer never flickers back while it uploads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { HomeTripInput, TripStatus } from '@cp/domain';

import { ACT_INBOX_ITEM, DISMISS_TIP } from '../home-commands';

export const PENDING_ACTS = `SELECT json_extract(envelope, '$.payload.item_id') FROM commands
                              WHERE cmd = '${ACT_INBOX_ITEM}'`;
const PENDING_DISMISSALS = `SELECT json_extract(envelope, '$.payload.tip_id') FROM commands
                             WHERE cmd = '${DISMISS_TIP}'`;

export const PROFILE_SQL = `SELECT u.display_name, s.active_crew_id
  FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`;
export const PROFILE_TABLES = ['users', 'user_settings'];

export const CREWS_SQL = `SELECT c.id, c.name FROM crew_members m JOIN crews c ON c.id = m.crew_id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at, c.id`;
export const CREWS_TABLES = ['crews', 'crew_members'];

export const MEMBERS_SQL = `SELECT m.user_id, m.colour, u.display_name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? AND m.status = 'active' ORDER BY m.created_at, m.user_id`;
export const MEMBERS_TABLES = ['crew_members', 'users'];

export const TRIPS_SQL = `SELECT t.id, t.status, t.start_date, t.end_date,
    coalesce(t.tz, d.tz) AS tz, t.destination_id, d.name AS destination_name, d.slug AS destination_slug, t.guide_id,
    g.slug AS guide_slug, t.plan_progress, p.countdown_target_at
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.crew_id = ? AND t.status <> 'cancelled'`;
export const TRIPS_TABLES = ['trips', 'destinations', 'guides', 'trip_participants'];

/**
 * The crew's trip that is locked in (confirmed or under way) with no seat for the viewer: they
 * have no participant row (they joined the crew after the proposal went out) or said out. The one
 * under way comes first, then the next to start.
 */
export const OPEN_TRIP_SQL = `SELECT t.id, t.status, d.name AS destination_name
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  WHERE t.crew_id = ? AND t.status IN ('confirmed', 'pre_trip', 'in_trip')
    AND (p.user_id IS NULL OR p.rsvp = 'out')
  ORDER BY (t.status = 'in_trip') DESC, t.start_date, t.id LIMIT 1`;
export const OPEN_TRIP_TABLES = ['trips', 'destinations', 'trip_participants'];

export interface OpenTripRow {
  readonly id: string;
  readonly status: string;
  readonly destination_name: string | null;
}

export const TIP_SQL = `SELECT h.id, h.text, h.kind, h.place_id, g.slug AS guide_slug
  FROM home_tips h LEFT JOIN guides g ON g.id = h.guide_id
  WHERE h.crew_id = ? AND h.status = 'active' AND julianday(h.valid_until) > julianday(?)
    AND coalesce((SELECT guide_tips FROM notification_prefs WHERE user_id = ?), 1) = 1
    AND h.id NOT IN (${PENDING_DISMISSALS})
  ORDER BY h.created_at DESC LIMIT 1`;
export const TIP_TABLES = ['home_tips', 'guides', 'notification_prefs', 'commands'];

export const NEEDS_YOU_SQL = `SELECT count(*) AS n FROM inbox_items
  WHERE user_id = ? AND needs_you = 1 AND resolved_at IS NULL
    AND (expires_at IS NULL OR julianday(expires_at) > julianday(?)) AND id NOT IN (${PENDING_ACTS})`;
export const NEEDS_YOU_TABLES = ['inbox_items', 'commands'];

export const GUIDE_CELLS_SQL = `SELECT s.guide_slug, s.destination_id, d.name AS place
  FROM critter_sets s LEFT JOIN destinations d ON d.id = s.destination_id
  WHERE s.guide_slug IS NOT NULL`;
export const GUIDE_CELLS_TABLES = ['critter_sets', 'destinations'];

export interface ProfileRow {
  readonly display_name: string | null;
  readonly active_crew_id: string | null;
}

export interface CrewRow {
  readonly id: string;
  readonly name: string | null;
}

export interface MemberRow {
  readonly user_id: string;
  readonly colour: string | null;
  readonly display_name: string | null;
}

export interface TripRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  readonly destination_slug?: string | null;
  readonly guide_id: string | null;
  readonly guide_slug: string | null;
  readonly plan_progress: number | null;
  readonly countdown_target_at: string | null;
}

export interface TipRow {
  readonly id: string;
  readonly text: string;
  readonly kind: string;
  readonly place_id: string | null;
  readonly guide_slug: string | null;
}

export interface GuideCellRow {
  readonly guide_slug: string;
  readonly destination_id: string | null;
  readonly place: string | null;
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/u)[0] ?? '';
}

/** The crew Home shows: the one a link asked for, else the chosen one, else the first joined. */
export function pickCrew(
  crews: readonly CrewRow[],
  requested: string | null,
  chosen: string | null,
): CrewRow | null {
  return (
    crews.find((crew) => crew.id === requested) ??
    crews.find((crew) => crew.id === chosen) ??
    crews[0] ??
    null
  );
}

export function toTripInput(row: TripRow): HomeTripInput {
  return {
    id: row.id,
    status: row.status as TripStatus,
    startDate: row.start_date,
    endDate: row.end_date,
    tz: row.tz,
    destinationId: row.destination_id,
    destinationName: row.destination_name,
    destinationSlug: row.destination_slug ?? null,
    guideId: row.guide_slug,
    planProgress: Math.max(0, Math.min(100, Number(row.plan_progress ?? 0))),
    countdownTargetAt: row.countdown_target_at,
  };
}
