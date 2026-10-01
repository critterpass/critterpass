/**
 * When a recipient's quiet hours end. Normally at their `quiet_to`; on a travel morning (a
 * leave-by they are on falls inside the quiet window) 90 minutes before that leave-by, so the
 * morning briefing and the crew reach someone who is already up to catch a flight. The window is
 * worked out in the recipient's day zone, the same one the router's clock runs in.
 */
import type pg from 'pg';

import { inQuietHours, type QuietHours } from './policy';

/** How long before an early leave-by quiet hours end. */
export const TRAVEL_MORNING_LEAD_MS = 90 * 60_000;

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

export interface QuietWindow {
  readonly start: Date;
  readonly end: Date;
}

/** The quiet window `now` falls in (to the minute), or `null` outside quiet hours. */
export function quietWindowAt(
  now: Date,
  localMinutes: number,
  quiet: QuietHours,
): QuietWindow | null {
  if (!inQuietHours(localMinutes, quiet)) return null;
  const minute = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const elapsed = (localMinutes - quiet.fromMinutes + DAY_MINUTES) % DAY_MINUTES;
  const remaining = (quiet.toMinutes - localMinutes + DAY_MINUTES) % DAY_MINUTES;
  return {
    start: new Date(minute - elapsed * MINUTE_MS),
    end: new Date(minute + remaining * MINUTE_MS),
  };
}

/** The end of a quiet window given the earliest leave-by inside it (never before its start). */
export function travelMorningEnd(window: QuietWindow, earliestLeaveAt: Date | null): Date {
  if (earliestLeaveAt === null) return window.end;
  return new Date(
    Math.max(window.start.getTime(), earliestLeaveAt.getTime() - TRAVEL_MORNING_LEAD_MS),
  );
}

/**
 * The instant `uid`'s quiet hours end, when they are quiet at `now`; `null` when they are not
 * (outside the window, or a travel morning has already ended it).
 */
export async function quietEndFor(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
  localMinutes: number,
  quiet: QuietHours,
): Promise<Date | null> {
  const window = quietWindowAt(now, localMinutes, quiet);
  if (window === null) return null;
  const { rows } = await tx.query<{ leave_at: Date | null }>(
    `SELECT min(leave_at) AS leave_at FROM leave_bys
      WHERE leave_at > $2 AND leave_at <= $3 AND state <> 'cancelled'
        AND $1::uuid = ANY (participant_ids)`,
    [uid, window.start, window.end],
  );
  const end = travelMorningEnd(window, rows[0]?.leave_at ?? null);
  return end.getTime() <= now.getTime() ? null : end;
}
