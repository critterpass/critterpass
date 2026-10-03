/**
 * `ideas.seed` (docs/api-contracts-planning.md, jobs): a trip's Ideas take in what its crew already
 * saved inside the destination and the swipe matches not yet on the plan, each with every member
 * who saved or matched it as a backer. Runs when the trip gets its destination, when a member
 * joins (their saves only) and once as a backfill. A place someone removed from Ideas is not
 * brought back by a whole-trip seed.
 */
import { outbox, sendInTx, withSystem } from '@cp/db';
import { channelName, PLANNING_QUEUES, PLANNING_RT, type IdeasSeedJob } from '@cp/domain';
import type pg from 'pg';

import { queuePlanCheck } from '../check/hooks';

/** One waiting seed per trip and person (or whole trip), so a join never drops a full seed. */
export function ideasSeedKey(job: IdeasSeedJob): string {
  return `ideas:${job.trip_id}:${job.user_id ?? 'all'}`;
}

const SEED_SQL = `
WITH trip AS (
  SELECT t.id, t.crew_id, t.current_version_id, d.id AS destination_id, d.place_bounds
    FROM trips t JOIN destinations d ON d.id = t.destination_id
   WHERE t.id = $1 AND t.phase IN ('planning', 'pre', 'in')),
saves AS (
  SELECT p.id AS poi_id, s.user_id, 'save'::text AS source, s.created_at
    FROM trip
    JOIN crew_members m ON m.crew_id = trip.crew_id AND m.status = 'active'
    JOIN saved_items s ON s.user_id = m.user_id AND s.kind = 'poi'
    JOIN pois p ON p.id = s.ref_id AND p.status = 'active'
   WHERE ($2::uuid IS NULL OR s.user_id = $2)
     AND (p.destination_id = trip.destination_id
          OR (trip.place_bounds IS NOT NULL AND ST_Intersects(p.location, trip.place_bounds)))),
matches AS (
  SELECT sm.poi_id, u.user_id, 'swipe'::text AS source, sm.created_at
    FROM trip
    JOIN swipe_matches sm ON sm.trip_id = trip.id
    CROSS JOIN LATERAL unnest(sm.user_ids) AS u(user_id)
    JOIN crew_members m ON m.crew_id = trip.crew_id AND m.user_id = u.user_id AND m.status = 'active'
   WHERE ($2::uuid IS NULL OR u.user_id = $2)
     AND NOT EXISTS (SELECT 1 FROM plan_items i
                      WHERE i.version_id = trip.current_version_id AND i.poi_id = sm.poi_id)),
wanted AS (
  SELECT w.poi_id, array_agg(DISTINCT w.user_id) AS backers, array_agg(DISTINCT w.source) AS sources,
         min(w.created_at) AS first_at
    FROM (SELECT * FROM saves UNION ALL SELECT * FROM matches) w
   WHERE $2::uuid IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM trip_ideas gone
                      WHERE gone.trip_id = $1 AND gone.poi_id = w.poi_id
                        AND gone.deleted_at IS NOT NULL)
   GROUP BY w.poi_id)
INSERT INTO trip_ideas (trip_id, poi_id, name, name_local, category, lat, lng, backer_ids, sources,
                        created_by)
SELECT $1, p.id, left(p.name, 120), left(p.name_local, 120), p.category, p.lat, p.lng, w.backers,
       w.sources, w.backers[1]
  FROM wanted w JOIN pois p ON p.id = w.poi_id
 ORDER BY w.first_at, p.id
ON CONFLICT (trip_id, poi_id) WHERE poi_id IS NOT NULL AND deleted_at IS NULL DO UPDATE
   SET backer_ids = trip_ideas.backer_ids || ARRAY(
         SELECT b FROM unnest(EXCLUDED.backer_ids) b WHERE b <> ALL(trip_ideas.backer_ids)),
       sources = trip_ideas.sources || ARRAY(
         SELECT s FROM unnest(EXCLUDED.sources) s WHERE s <> ALL(trip_ideas.sources))
 WHERE NOT (EXCLUDED.backer_ids <@ trip_ideas.backer_ids AND EXCLUDED.sources <@ trip_ideas.sources)
RETURNING id`;

/** Seeds one trip in `tx`; returns the ideas created or given new backers. */
export async function seedTripIdeas(tx: pg.PoolClient, job: IdeasSeedJob): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(SEED_SQL, [job.trip_id, job.user_id ?? null]);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return ids;
  await outbox(tx, channelName('trip_plan', job.trip_id), PLANNING_RT.ideasChanged, {
    idea_ids: ids.slice(0, 50),
  });
  await queuePlanCheck(tx, job.trip_id, 'ideas');
  return ids;
}

export function runIdeasSeed(pool: pg.Pool, job: IdeasSeedJob): Promise<string[]> {
  return withSystem(pool, (tx) => seedTripIdeas(tx, job));
}

const SEED_EVENTS: ReadonlySet<string> = new Set(['trip.destination_set', 'crew.member_joined']);

/**
 * Queues the seed from the worker's own transactions (a poll closed by its deadline sets the
 * destination here); the api registers the same hook for the events it appends.
 */
export async function ideasSeedEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!SEED_EVENTS.has(event.type)) return;
  // The routing read is the system's; the hook may run inside a member's transaction.
  const role = (await tx.query<{ role: string }>('SELECT current_user::text AS role')).rows[0]
    ?.role;
  await tx.query('SET LOCAL ROLE app_system');
  const { rows } = await tx.query<{ trip_id: string; user_id: string | null }>(
    `SELECT t.id AS trip_id,
            CASE WHEN e.type = 'crew.member_joined' THEN (e.payload->>'user_id')::uuid END AS user_id
       FROM app.domain_event_for_routing($1) e
       JOIN trips t ON t.destination_id IS NOT NULL AND t.phase IN ('planning', 'pre', 'in')
        AND ((e.type = 'trip.destination_set' AND t.id = (e.payload->>'trip_id')::uuid)
          OR (e.type = 'crew.member_joined' AND t.crew_id = (e.payload->>'crew_id')::uuid))
      ORDER BY t.id`,
    [event.id],
  );
  if (role !== undefined) await tx.query("SELECT set_config('role', $1, true)", [role]);
  for (const row of rows) {
    const job: IdeasSeedJob =
      row.user_id === null
        ? { trip_id: row.trip_id }
        : { trip_id: row.trip_id, user_id: row.user_id };
    await sendInTx(tx, PLANNING_QUEUES.ideasSeed, job, { singletonKey: ideasSeedKey(job) });
  }
}
