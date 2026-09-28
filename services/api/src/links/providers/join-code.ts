/**
 * Crew, trip and referral codes (`/i/{code}`, `/j/{code}`, `/r/{code}`, typed codes): the code
 * lookup of ../join-code-provider.ts, plus, for a trip code, the trip's dates and how many of its
 * seats are taken, so a stranger holding the link sees "SEAT n OF cap" before joining.
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
}

/** Dates and seats of one trip, read as the system (the caller is not in the crew yet). */
export async function tripSeats(tx: pg.PoolClient, tripId: string): Promise<TripSeats | null> {
  const { rows } = await tx.query<TripSeats>(
    `SELECT to_char(t.start_date, 'YYYY-MM-DD') AS trip_start,
            to_char(t.end_date, 'YYYY-MM-DD') AS trip_end,
            (SELECT count(*)::int FROM trip_participants tp WHERE tp.trip_id = t.id AND tp.holds_seat)
              AS seats_taken,
            coalesce((SELECT te.seat_cap FROM trip_entitlements te WHERE te.trip_id = t.id), 6)
              AS seat_cap
       FROM trips t WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] ?? null;
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
  const tripId = resolved?.joinCodeId == null ? null : await codeTrip(ctx.tx, resolved.joinCodeId);
  const seats = tripId === null ? null : await tripSeats(ctx.tx, tripId);
  return seats === null ? preview : { ...preview, ...seats };
}

export function resolveJoinCode(ctx: LinkProviderContext): Promise<ResolvedLink | null> {
  return joinCodeProvider.resolve(ctx);
}
