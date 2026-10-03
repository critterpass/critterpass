/**
 * `anniversary.scan` (hourly): every anniversary whose morning has come in its traveller's zone
 * fires once: the trip's memory is made (or found), the timer is marked fired with it, and
 * `memory.surfaced` brings N-35 to that traveller, quietly. A traveller who left the crew still
 * gets theirs; one whose account is gone has no timer left. Rows are claimed with SKIP LOCKED, so
 * two scans never fire the same one.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { RECAP_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { ensureTripMemory } from './build-memory';

/** How many anniversaries one run fires; the next hour picks up any rest. */
const BATCH = 200;

export async function runAnniversaryScan(pool: pg.Pool, now: Date = new Date()): Promise<number> {
  let fired = 0;
  for (let i = 0; i < BATCH; i += 1) {
    const done = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string; recap_id: string; user_id: string }>(
        `SELECT id, recap_id, user_id FROM anniversaries
          WHERE status = 'scheduled' AND fire_at <= $1
          ORDER BY fire_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [now],
      );
      const due = rows[0];
      if (due === undefined) return false;
      const memory = await ensureTripMemory(tx, due.recap_id);
      if (memory === null) {
        await tx.query("UPDATE anniversaries SET status = 'cancelled' WHERE id = $1", [due.id]);
        return true;
      }
      await tx.query(
        `UPDATE anniversaries SET status = 'fired', fired_at = $2, memory_id = $3 WHERE id = $1`,
        [due.id, now, memory.id],
      );
      await appendDomainEvent(tx, {
        type: 'memory.surfaced',
        aggregateKind: 'memory',
        aggregateId: memory.id,
        actorKind: 'guide',
        actorId: null,
        tripId: memory.tripId,
        payload: { trip_id: memory.tripId, memory_id: memory.id, user_id: due.user_id },
      });
      fired += 1;
      return true;
    });
    if (!done) break;
  }
  return fired;
}

export function anniversaryScanJob(): AnyJobDefinition {
  return defineJob({
    queue: RECAP_QUEUES.anniversaryScan,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { fired: await runAnniversaryScan(pool) };
    },
  });
}
