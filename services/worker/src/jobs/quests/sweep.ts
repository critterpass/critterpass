/**
 * `quests.sweep` (hourly): every trip on its dates whose local morning has come (04:00 on the trip's
 * clock) and that has no quests for its local date yet gets its `quests.generate`, so the first
 * day of a trip, a missed run or a trip confirmed mid-trip all catch up within the hour. Quests
 * whose deadline or day has passed without finishing expire here.
 */
import { sendInTx, withSystem } from '@cp/db';
import { QUEST_GENERATION_HOUR, QUEST_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss';

export async function sweepQuestDays(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ readonly queued: number; readonly expired: number }> {
  return withSystem(pool, async (tx) => {
    const expired = await tx.query(
      `UPDATE quests SET status = 'expired'
        WHERE status IN ('offered', 'active') AND ends_at <= $1`,
      [now],
    );
    const { rows } = await tx.query<{ trip_id: string; local_date: string }>(
      `SELECT t.id AS trip_id, local.day::text AS local_date
         FROM trips t
         LEFT JOIN destinations d ON d.id = t.destination_id
         CROSS JOIN LATERAL (
           SELECT ($1::timestamptz AT TIME ZONE coalesce(t.tz, d.tz, 'UTC')) AS at
         ) wall
         CROSS JOIN LATERAL (SELECT wall.at::date AS day) local
        WHERE t.status NOT IN ('voting', 'cancelled', 'archived')
          AND local.day BETWEEN t.start_date AND t.end_date
          AND extract(hour FROM wall.at) >= $2
          AND NOT EXISTS (SELECT 1 FROM quests q WHERE q.trip_id = t.id AND q.local_date = local.day)`,
      [now, QUEST_GENERATION_HOUR],
    );
    for (const row of rows) {
      await sendInTx(tx, QUEST_QUEUES.generate, row, {
        singletonKey: `${row.trip_id}:${row.local_date}`,
      });
    }
    return { queued: rows.length, expired: expired.rowCount ?? 0 };
  });
}

export function questSweepJob(): AnyJobDefinition {
  return defineJob({
    queue: QUEST_QUEUES.sweep,
    schema: z.object({}).nullish(),
    handler: (_data, { pool }) => sweepQuestDays(pool),
  });
}
