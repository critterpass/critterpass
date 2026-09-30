/**
 * `critter.grant_eggs` (the system `grant_egg`): after a boarding (an RSVP of in), a dropout or a
 * trip moving, every boarded traveller on the trip without an egg gets one (`app.grant_egg`: the
 * destination set's starter form), and an unhatched egg of someone now out is taken back. Safe to
 * run any number of times.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { CRITTER_QUEUES, grantEggsJobSchema, type GrantEggsJob } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export async function grantEggs(
  pool: pg.Pool,
  job: GrantEggsJob,
): Promise<{ readonly granted: number; readonly withdrawn: number }> {
  return withSystem(pool, async (tx) => {
    const withdrawn = await tx.query(
      `DELETE FROM eggs e USING trip_participants p
        WHERE e.trip_id = $1 AND e.hatched_at IS NULL AND p.trip_id = e.trip_id
          AND p.user_id = e.user_id AND p.rsvp = 'out' AND ($2::uuid IS NULL OR e.user_id = $2)`,
      [job.trip_id, job.user_id ?? null],
    );
    const { rows: travellers } = await tx.query<{ user_id: string }>(
      `SELECT user_id FROM trip_participants
        WHERE trip_id = $1 AND ($2::uuid IS NULL OR user_id = $2)
          AND (rsvp = 'in' OR (role = 'organiser' AND rsvp <> 'out'))
          AND NOT EXISTS (SELECT 1 FROM eggs e WHERE e.trip_id = $1 AND e.user_id = trip_participants.user_id)
        ORDER BY user_id`,
      [job.trip_id, job.user_id ?? null],
    );
    let granted = 0;
    for (const { user_id: uid } of travellers) {
      const { rows } = await tx.query<{ egg_id: string; created: boolean }>(
        'SELECT * FROM app.grant_egg($1, $2)',
        [uid, job.trip_id],
      );
      const egg = rows[0];
      if (egg?.created !== true) continue;
      granted += 1;
      await appendDomainEvent(tx, {
        type: 'egg.granted',
        aggregateKind: 'egg',
        aggregateId: egg.egg_id,
        actorKind: 'system',
        actorId: null,
        tripId: job.trip_id,
        payload: { trip_id: job.trip_id, user_id: uid, egg_id: egg.egg_id },
      });
    }
    return { granted, withdrawn: withdrawn.rowCount ?? 0 };
  });
}

export function grantEggsJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.grantEggs,
    schema: grantEggsJobSchema,
    singletonKey: (data) => `${data.trip_id}:${data.user_id ?? '*'}`,
    async handler(data, { pool }) {
      return grantEggs(pool, data);
    },
  });
}
