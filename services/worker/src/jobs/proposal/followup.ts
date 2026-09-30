/**
 * `followup.deliver` (every minute): a follow-up a recipient asked for ("ask me on Sunday") or a
 * resend the organiser scheduled from a suggestion, delivered once when due (N-08). The push finds
 * its one recipient from the row; the event names nobody.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { PROPOSAL_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export async function runFollowups(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ delivered: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      proposal_id: string;
      trip_id: string;
      crew_id: string;
    }>(
      `UPDATE proposal_followups f SET status = 'delivered', delivered_at = $1
         FROM trips t
        WHERE f.id IN (SELECT id FROM proposal_followups
                        WHERE status = 'scheduled' AND due_at <= $1
                        ORDER BY due_at LIMIT 200 FOR UPDATE SKIP LOCKED)
          AND t.id = f.trip_id
        RETURNING f.id, f.proposal_id, f.trip_id, t.crew_id`,
      [now],
    );
    for (const row of rows) {
      await appendDomainEvent(tx, {
        type: 'followup.due',
        aggregateKind: 'proposal_followup',
        aggregateId: row.id,
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: row.trip_id, proposal_id: row.proposal_id, followup_id: row.id },
        crewId: row.crew_id,
        tripId: row.trip_id,
      });
    }
    return { delivered: rows.length };
  });
}

export function followupJob(): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.followup,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await runFollowups(pool)) };
    },
  });
}
