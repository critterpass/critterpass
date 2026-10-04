/**
 * Writes a version's legs: upserts the pairs it has now, removes the pairs it no longer has, and
 * leaves unchanged rows untouched so a replay syncs nothing. A change to minutes, mode or the
 * pairs appends `plan.legs_updated`; any change, a new road shape included, hints open screens.
 * A version that stopped being live while its legs were routed gets none; legs of versions no
 * longer live are dropped (the stream only shows live versions).
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, PLANNING_RT } from '@cp/domain';
import type pg from 'pg';

import type { ComputedLeg } from './compute';
import { LIVE_VERSION_STATUSES } from './load';

export async function writeVersionLegs(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
  legs: readonly ComputedLeg[],
): Promise<{ readonly changed: number }> {
  const { rows } = await tx.query<{
    removed: number;
    written: number;
    moved: number;
    live: boolean;
  }>(
    `WITH live AS (
       SELECT EXISTS (SELECT 1 FROM itinerary_versions
                       WHERE id = $2 AND trip_id = $1 AND status = ANY($11::text[])) AS ok
     ), fresh AS (
       SELECT * FROM unnest($3::uuid[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[],
                            $9::text[], $10::bool[], $12::text[])
                AS f(day_id, from_key, to_key, mode, minutes, meters, source, approx, shape)
        WHERE (SELECT ok FROM live)
     ), moved AS (
       SELECT count(*)::int AS n FROM fresh f
         LEFT JOIN plan_legs l ON l.version_id = $2 AND l.from_key = f.from_key
                              AND l.to_key = f.to_key
        WHERE l.id IS NULL
           OR (l.day_id, l.mode, l.minutes, l.meters, l.source, l.approx)
              IS DISTINCT FROM (f.day_id, f.mode, f.minutes, f.meters, f.source, f.approx)
     ), removed AS (
       DELETE FROM plan_legs l
        WHERE l.version_id = $2
          AND NOT EXISTS (SELECT 1 FROM fresh f WHERE f.from_key = l.from_key AND f.to_key = l.to_key)
       RETURNING 1
     ), written AS (
       INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                              source, approx, shape)
       SELECT $1, $2, day_id, from_key, to_key, mode, minutes, meters, source, approx, shape
         FROM fresh
       ON CONFLICT (version_id, from_key, to_key) DO UPDATE
         SET day_id = EXCLUDED.day_id, mode = EXCLUDED.mode, minutes = EXCLUDED.minutes,
             meters = EXCLUDED.meters, source = EXCLUDED.source, approx = EXCLUDED.approx,
             shape = EXCLUDED.shape, computed_at = now(), updated_at = now()
         WHERE (plan_legs.day_id, plan_legs.mode, plan_legs.minutes, plan_legs.meters,
                plan_legs.source, plan_legs.approx, plan_legs.shape)
               IS DISTINCT FROM (EXCLUDED.day_id, EXCLUDED.mode, EXCLUDED.minutes,
                                 EXCLUDED.meters, EXCLUDED.source, EXCLUDED.approx,
                                 EXCLUDED.shape)
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM removed)::int AS removed,
            (SELECT count(*) FROM written)::int AS written,
            (SELECT n FROM moved) AS moved,
            (SELECT ok FROM live) AS live`,
    [
      tripId,
      versionId,
      legs.map((leg) => leg.dayId),
      legs.map((leg) => leg.fromKey),
      legs.map((leg) => leg.toKey),
      legs.map((leg) => leg.mode),
      legs.map((leg) => leg.minutes),
      legs.map((leg) => leg.meters),
      legs.map((leg) => leg.source),
      legs.map((leg) => leg.approx),
      LIVE_VERSION_STATUSES,
      legs.map((leg) => leg.shape),
    ],
  );
  const row = rows[0];
  const changed = row === undefined ? 0 : row.removed + row.written;
  if (changed === 0 || row?.live !== true) return { changed };
  // A new road shape alone is only drawn: the plan check reads minutes, so it is not asked again.
  if (row.removed + row.moved > 0) {
    await appendDomainEvent(tx, {
      type: 'plan.legs_updated',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'system',
      actorId: null,
      tripId,
      payload: { trip_id: tripId, version_id: versionId },
    });
  }
  await outbox(tx, channelName('trip_plan', tripId), PLANNING_RT.legsUpdated, {
    version: versionId,
  });
  return { changed };
}

/** Drops the legs of versions that are no longer drafts, proposals or the current plan. */
export async function dropStaleVersionLegs(tx: pg.PoolClient, tripId: string): Promise<number> {
  const { rowCount } = await tx.query(
    `DELETE FROM plan_legs l
      WHERE l.trip_id = $1
        AND NOT EXISTS (SELECT 1 FROM itinerary_versions v
                         WHERE v.id = l.version_id AND v.status = ANY($2::text[]))`,
    [tripId, LIVE_VERSION_STATUSES],
  );
  return rowCount ?? 0;
}
