/**
 * Queues `ideas.seed` from the api's own transactions (the worker registers the same hook for the
 * events it appends): a trip that just got its destination, or a new stop or day-trip area, takes
 * in what its crew already saved there, and a member who joins brings their saves into the crew's active trips.
 */
import { sendInTx } from '@cp/db';
import { PLANNING_QUEUES, type IdeasSeedJob } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

const SEED_EVENTS: ReadonlySet<string> = new Set([
  'trip.destination_set',
  'trip.areas_changed',
  'crew.member_joined',
]);

export async function ideasSeedEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!SEED_EVENTS.has(event.type)) return;
  const jobs = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ trip_id: string; user_id: string | null }>(
      `SELECT t.id AS trip_id,
              CASE WHEN e.type = 'crew.member_joined' THEN (e.payload->>'user_id')::uuid END AS user_id
         FROM app.domain_event_for_routing($1) e
         JOIN trips t ON t.destination_id IS NOT NULL AND t.phase IN ('planning', 'pre', 'in')
          AND ((e.type IN ('trip.destination_set', 'trip.areas_changed')
                AND t.id = (e.payload->>'trip_id')::uuid)
            OR (e.type = 'crew.member_joined' AND t.crew_id = (e.payload->>'crew_id')::uuid))
        ORDER BY t.id`,
      [event.id],
    );
    return rows;
  });
  for (const row of jobs) {
    const job: IdeasSeedJob =
      row.user_id === null
        ? { trip_id: row.trip_id }
        : { trip_id: row.trip_id, user_id: row.user_id };
    // One waiting seed per trip and person (or whole trip), so a join never drops a full seed.
    await sendInTx(tx, PLANNING_QUEUES.ideasSeed, job, {
      singletonKey: `ideas:${job.trip_id}:${job.user_id ?? 'all'}`,
    });
  }
}
