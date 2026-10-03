/**
 * The legs backfill on the real schema: it queues one `plan.legs` run per trip with a live plan,
 * spread over time behind the usual debounce, routes nothing itself, counts a trip whose run is
 * already waiting instead of queueing it twice, and a dry run writes nothing.
 */
import { randomUUID } from 'node:crypto';

import type { PlanningTravel } from '@cp/suppliers';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { queueLegsBackfill } from '../../src/jobs/planning/legs/backfill-queue';
import { planLegsJob } from '../../src/jobs/planning/legs/job';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let owner: string;
const trips: { tripId: string; versionId: string }[] = [];

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

/** A trip in planning with a current plan; `live = false` leaves its only version superseded. */
async function seedTrip(live: boolean): Promise<{ tripId: string; versionId: string }> {
  const crew = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
    'Ubud',
    owner,
  ]);
  const tripId = await one(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
    [crew],
  );
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', $2)
     RETURNING id`,
    [tripId, live ? 'current' : 'superseded'],
  );
  if (live) {
    await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      tripId,
      versionId,
    ]);
  }
  return { tripId, versionId };
}

/** Planning travel that fails the test if anything asks it for a route. */
const noRouting: PlanningTravel = {
  travel: () => Promise.reject(new Error('the backfill must not route')),
  matrix: () => Promise.reject(new Error('the backfill must not route')),
};

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  for (let i = 0; i < 3; i += 1) trips.push(await seedTrip(true));
  await seedTrip(false);
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('legs backfill', () => {
  it('counts the trips on a dry run and writes nothing', async () => {
    const result = await queueLegsBackfill(harness.pool, { dryRun: true });
    expect(result).toMatchObject({ trips: 3, queued: 0, alreadyQueued: 0 });
    const { rows } = await harness.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'plan.legs'",
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('queues one spread-out run per trip for the worker and routes nothing itself', async () => {
    // A running worker proves the runs wait: none starts inside the debounce.
    await harness.startRuntime([planLegsJob(noRouting)]);
    const result = await queueLegsBackfill(harness.pool, { perMinute: 2 });
    expect(result).toEqual({ trips: 3, queued: 3, alreadyQueued: 0, lastStartsIn: 90 });

    const { rows } = await harness.pool.query<{ data: unknown; key: string; wait_s: number }>(
      `SELECT data, singleton_key AS key,
              round(extract(epoch FROM start_after - created_on))::int AS wait_s
         FROM pgboss.job WHERE name = 'plan.legs' ORDER BY start_after`,
    );
    const expected = [...trips].sort((a, b) => a.tripId.localeCompare(b.tripId));
    expect(rows).toEqual(
      expected.map((trip, index) => ({
        data: { trip_id: trip.tripId, version_id: trip.versionId },
        key: `legs:${trip.tripId}`,
        wait_s: 30 + index * 30,
      })),
    );
    const legs = await harness.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM plan_legs',
    );
    expect(legs.rows[0]?.n).toBe(0);

    const again = await queueLegsBackfill(harness.pool, { perMinute: 2 });
    expect(again).toMatchObject({ trips: 3, queued: 0, alreadyQueued: 3 });
  });
});
