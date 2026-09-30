/**
 * Watching a flight (free for any wallet flight): its schedule checks are armed at T−72 h (when the
 * worker also registers the provider alert), T−24 h, T−6 h and T−3 h, and its boarding ping at the
 * boarding time (announced, or departure − 40 min as an estimate). Timers in the past are skipped;
 * arming again moves them. Which provider answers is the worker's (the one configured there).
 */
import { cancelScheduledEvent, scheduleEvent } from '@cp/db';
import { BOOKINGS_QUEUES } from '@cp/domain';
import type pg from 'pg';

export const POLL_SLOTS: readonly (readonly [string, number])[] = [
  ['t72', 72],
  ['t24', 24],
  ['t6', 6],
  ['t3', 3],
];

export interface WatchedSegment {
  readonly id: string;
  readonly schedDepAt: Date;
  readonly boardingAt: Date | null;
}

export async function armFlightWatch(
  tx: pg.PoolClient,
  segments: readonly WatchedSegment[],
  now: Date,
): Promise<number> {
  let armed = 0;
  for (const segment of segments) {
    for (const [slot, hours] of POLL_SLOTS) {
      const at = new Date(segment.schedDepAt.getTime() - hours * 3_600_000);
      const key = { kind: BOOKINGS_QUEUES.flightPoll, refId: segment.id, slot };
      if (at.getTime() <= now.getTime()) {
        await cancelScheduledEvent(tx, key);
        continue;
      }
      await scheduleEvent(tx, { ...key, tz: 'UTC', at });
      armed += 1;
    }
    const boardingKey = { kind: BOOKINGS_QUEUES.boardingSchedule, refId: segment.id };
    if (segment.boardingAt !== null && segment.boardingAt.getTime() > now.getTime()) {
      await scheduleEvent(tx, { ...boardingKey, tz: 'UTC', at: segment.boardingAt });
      armed += 1;
    } else {
      await cancelScheduledEvent(tx, boardingKey);
    }
  }
  return armed;
}

/** The booking's segments as the timers need them (read as the caller's transaction allows). */
export async function segmentsOf(tx: pg.PoolClient, bookingId: string): Promise<WatchedSegment[]> {
  const { rows } = await tx.query<{ id: string; sched_dep_at: Date; boarding_at: Date | null }>(
    'SELECT id, sched_dep_at, boarding_at FROM flight_segments WHERE booking_id = $1 ORDER BY segment_no',
    [bookingId],
  );
  return rows.map((row) => ({
    id: row.id,
    schedDepAt: row.sched_dep_at,
    boardingAt: row.boarding_at,
  }));
}
