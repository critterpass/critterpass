/**
 * Crew, trip and referral codes (`/i/{code}`, `/j/{code}`, `/r/{code}`, typed codes): the code
 * lookup of ../join-code-provider.ts, plus what the invite ticket shows a stranger holding the
 * link: the crew's members as stubs (first name and colour), how many named seats still wait (never
 * who), and for a trip code its dates, seats taken of the cap, the per-person estimate and guide.
 */
import type { LinkPreview } from '@cp/domain';
import type pg from 'pg';

import { joinCodeProvider } from '../join-code-provider';
import type { LinkProviderContext, ResolvedLink } from '../registry';

export interface TripSeats {
  readonly trip_start: string | null;
  readonly trip_end: string | null;
  readonly seats_taken: number;
  readonly seat_cap: number;
  readonly estimate_minor: number | null;
  readonly estimate_currency: string | null;
  readonly guide_slug: string | null;
}

/** Dates, seats, estimate and guide of one trip, read as the system (the caller is not in yet). */
export async function tripSeats(tx: pg.PoolClient, tripId: string): Promise<TripSeats | null> {
  const { rows } = await tx.query<TripSeats>(
    `SELECT to_char(t.start_date, 'YYYY-MM-DD') AS trip_start,
            to_char(t.end_date, 'YYYY-MM-DD') AS trip_end,
            (SELECT count(*)::int FROM trip_participants tp WHERE tp.trip_id = t.id AND tp.holds_seat)
              AS seats_taken,
            coalesce((SELECT te.seat_cap FROM trip_entitlements te WHERE te.trip_id = t.id), 6)
              AS seat_cap,
            (SELECT round(avg(s.total_minor))::int FROM trip_share_totals s
              WHERE s.trip_id = t.id AND NOT s.is_missing) AS estimate_minor,
            (SELECT min(s.currency) FROM trip_share_totals s
              WHERE s.trip_id = t.id AND NOT s.is_missing) AS estimate_currency,
            (SELECT g.slug FROM guides g WHERE g.id = t.guide_id) AS guide_slug
       FROM trips t WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] ?? null;
}

interface CrewPeople {
  readonly members: { first_name: string; colour: string | null }[];
  readonly invited_waiting: number;
}

/** The crew's active members in join order, and its open named seats (trip-scoped when given). */
export async function crewPeople(
  tx: pg.PoolClient,
  crewId: string,
  tripId: string | null,
): Promise<CrewPeople> {
  const { rows } = await tx.query<{ first_name: string; colour: string | null }>(
    `SELECT split_part(coalesce(nullif(trim(u.display_name), ''), '?'), ' ', 1) AS first_name,
            cm.colour
       FROM crew_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.crew_id = $1 AND cm.status = 'active'
      ORDER BY cm.created_at, cm.id LIMIT 16`,
    [crewId],
  );
  const { rows: waiting } = await tx.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM invites
      WHERE crew_id = $1 AND kind = 'personal' AND status IN ('pending', 'later')
        AND expires_at > now() AND ($2::uuid IS NULL OR trip_id = $2)`,
    [crewId, tripId],
  );
  return { members: rows, invited_waiting: waiting[0]?.n ?? 0 };
}

async function codeTrip(tx: pg.PoolClient, joinCodeId: string): Promise<string | null> {
  const { rows } = await tx.query<{ target_id: string }>(
    "SELECT target_id FROM join_codes WHERE id = $1 AND target_kind = 'trip'",
    [joinCodeId],
  );
  return rows[0]?.target_id ?? null;
}

export async function previewJoinCode(ctx: LinkProviderContext): Promise<LinkPreview | null> {
  const preview = await joinCodeProvider.preview(ctx);
  if (preview === null) return null;
  const resolved = await joinCodeProvider.resolve(ctx);
  if (resolved?.crewId == null || resolved.joinCodeId === null) return preview;
  const tripId = await codeTrip(ctx.tx, resolved.joinCodeId);
  const seats = tripId === null ? null : await tripSeats(ctx.tx, tripId);
  return {
    ...preview,
    ...(await crewPeople(ctx.tx, resolved.crewId, tripId)),
    ...(seats ?? {}),
  };
}

export function resolveJoinCode(ctx: LinkProviderContext): Promise<ResolvedLink | null> {
  return joinCodeProvider.resolve(ctx);
}
