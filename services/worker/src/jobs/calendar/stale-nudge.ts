/**
 * `calendar.stale_nudge` (docs/api-contracts-async.md §2.3): hourly, for every trip still choosing
 * its dates, each setup member whose local time is now 09:xx and whose calendar is missing (no
 * source and no marked day) or stale (last synced more than 72 hours ago) gets one nudge — once per
 * stale period: no second nudge until they sync again. The same pass queues the daily sync of
 * connected OAuth calendars that have not synced for a day.
 */
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import { CALENDAR_STALE_HOURS, SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

export const NUDGE_LOCAL_HOUR = 9;
const DAILY_SYNC_HOURS = 24;

interface Candidate {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly user_id: string;
  readonly last_sync_at: Date | null;
  readonly marked_days: number;
}

export async function nudgeStaleCalendars(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ nudged: number; synced: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<Candidate>(
      `SELECT t.id AS trip_id, t.crew_id, m.uid AS user_id,
              (SELECT max(s.last_sync_at) FROM calendar_sources s
                WHERE s.user_id = m.uid AND s.status = 'active') AS last_sync_at,
              (SELECT count(*)::int FROM calendar_days d
                WHERE d.user_id = m.uid AND d.date >= current_date AND d.state <> 'unknown') AS marked_days
         FROM trips t
         CROSS JOIN LATERAL app.setup_member_ids(t.id) AS m(uid)
         JOIN users u ON u.id = m.uid
        WHERE t.status IN ('won', 'setup') AND t.start_date IS NULL
          AND extract(hour FROM $1::timestamptz AT TIME ZONE coalesce(u.tz, 'UTC')) = $2`,
      [now, NUDGE_LOCAL_HOUR],
    );
    const staleBefore = new Date(now.getTime() - CALENDAR_STALE_HOURS * 3_600_000);
    let nudged = 0;
    for (const row of rows) {
      const missing = row.last_sync_at === null && row.marked_days === 0;
      const stale = row.last_sync_at !== null && row.last_sync_at < staleBefore;
      if (!missing && !stale) continue;
      const since = row.last_sync_at ?? new Date(0);
      const last = await tx.query<{ at: Date | null }>(
        "SELECT app.last_setup_event_at('calendar.stale', $1, $2) AS at",
        [row.trip_id, row.user_id],
      );
      const nudgedAt = last.rows[0]?.at ?? null;
      if (nudgedAt !== null && nudgedAt > since) continue;
      await appendDomainEvent(tx, {
        type: 'calendar.stale',
        aggregateKind: 'user',
        aggregateId: row.user_id,
        actorKind: 'system',
        actorId: null,
        crewId: row.crew_id,
        tripId: row.trip_id,
        payload: {
          trip_id: row.trip_id,
          user_id: row.user_id,
          reason: missing ? 'missing' : 'stale',
        },
      });
      nudged += 1;
    }
    const due = await tx.query<{ id: string }>(
      `SELECT s.id FROM calendar_sources s
        WHERE s.status = 'active' AND s.kind IN ('oauth_google', 'oauth_microsoft')
          AND (s.last_sync_at IS NULL OR s.last_sync_at < $1)
          AND EXISTS (
            SELECT 1 FROM trips t JOIN crew_members m ON m.crew_id = t.crew_id
             WHERE m.user_id = s.user_id AND m.status = 'active' AND t.status IN ('won', 'setup')
          )`,
      [new Date(now.getTime() - DAILY_SYNC_HOURS * 3_600_000)],
    );
    for (const source of due.rows) {
      await sendInTx(
        tx,
        SETUP_QUEUES.calendarSync,
        { source_id: source.id },
        {
          singletonKey: source.id,
        },
      );
    }
    return { nudged, synced: due.rows.length };
  });
}

export function calendarStaleNudgeJob(): JobDefinition<Record<string, never> | null | undefined> {
  return defineJob({
    queue: SETUP_QUEUES.staleNudge,
    schema: z.object({}).nullish(),
    handler: async (_data, ctx) => ({ ...(await nudgeStaleCalendars(ctx.pool)) }),
  });
}
