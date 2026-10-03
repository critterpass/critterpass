/**
 * The one-off Ideas backfill: seeds every trip in planning, pre or in that has a destination with
 * its crew's saves there and its matches not yet on the plan. Each trip is its own transaction,
 * so a failure leaves the trips before it seeded; running it again only adds what is missing.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { runIdeasSeed } from './seed';

export interface IdeasBackfillResult {
  readonly trips: number;
  /** Ideas created or given new backers. */
  readonly ideas: number;
}

export async function backfillIdeas(pool: pg.Pool): Promise<IdeasBackfillResult> {
  const trips = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM trips
        WHERE destination_id IS NOT NULL AND phase IN ('planning', 'pre', 'in')
        ORDER BY id`,
    );
    return rows.map((row) => row.id);
  });
  let ideas = 0;
  for (const tripId of trips) ideas += (await runIdeasSeed(pool, { trip_id: tripId })).length;
  return { trips: trips.length, ideas };
}
