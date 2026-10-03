/**
 * The planning queues' `stately` policy on a real pg-boss: a burst of plan events for one trip
 * folds into at most one waiting and one running `plan.legs` run, and a worker boot moves a live
 * queue created under the old policy onto the new one, keeping its waiting runs (duplicates
 * folded) and their start times. Policy drift the catalogue doesn't list is reported, not touched.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import {
  DEFAULT_QUEUE_SPEC,
  planLegsJobSchema,
  PLANNING_QUEUES,
  planningQueueSpecs,
} from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { defineJob, ensureQueues } from '../../src/boss';
import { legsEventHook } from '../../src/jobs/planning/legs';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const specs = planningQueueSpecs(DEFAULT_QUEUE_SPEC);

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

async function states(queue: string, key: string): Promise<Record<string, number>> {
  const { rows } = await harness.pool.query<{ state: string; n: number }>(
    `SELECT state, count(*)::int AS n FROM pgboss.job
      WHERE name = $1 AND singleton_key = $2 GROUP BY state`,
    [queue, key],
  );
  return Object.fromEntries(rows.map((row) => [row.state, row.n]));
}

async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('timed out waiting');
}

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('planning queue policy', () => {
  it('folds a burst of plan events into one waiting run behind the running one', async () => {
    const owner = randomUUID();
    await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
    const crew = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
      'Ubud',
      owner,
    ]);
    const tripId = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
      [crew],
    );
    const versionId = await one(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id`,
      [tripId],
    );
    await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      tripId,
      versionId,
    ]);

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const key = `legs:${tripId}`;
    const boss = await harness.startRuntime([
      defineJob({
        queue: PLANNING_QUEUES.legs,
        spec: specs['plan.legs'],
        schema: planLegsJobSchema,
        singletonKey: (data) => `legs:${data.trip_id}`,
        handler: () => gate,
      }),
    ]);
    await boss.send(
      PLANNING_QUEUES.legs,
      { trip_id: tripId, version_id: versionId },
      {
        singletonKey: key,
      },
    );
    await until(async () => (await states(PLANNING_QUEUES.legs, key)).active === 1);

    await withSystem(harness.pool, async (tx) => {
      for (const type of ['plan.ops_applied', 'booking.edited', 'plan.version_created']) {
        await legsEventHook(tx, { type, tripId });
        await legsEventHook(tx, { type, tripId });
      }
    });
    expect(await states(PLANNING_QUEUES.legs, key)).toEqual({ active: 1, created: 1 });
    release();
  });

  it('moves a live queue onto the new policy at boot, keeping its waiting runs', async () => {
    const boss = await harness.startRuntime([]);
    const queue = PLANNING_QUEUES.check;
    await boss.createQueue(queue, { policy: 'singleton' });
    const later = new Date(Date.now() + 600_000);
    for (const trip of ['a', 'a', 'b']) {
      await boss.send(
        queue,
        { trip_id: trip },
        { singletonKey: `check:${trip}`, startAfter: later },
      );
    }
    expect(await states(queue, 'check:a')).toEqual({ created: 2 });

    const drifted = await ensureQueues(boss, [[queue, specs['plan.check']]]);
    expect(drifted).toEqual([]);
    expect((await boss.getQueue(queue))?.policy).toBe('stately');
    const { rows } = await harness.pool.query<{ key: string; later: boolean }>(
      `SELECT singleton_key AS key, start_after > now() + interval '500 seconds' AS later
         FROM pgboss.job WHERE name = $1 AND state = 'created' ORDER BY singleton_key`,
      [queue],
    );
    expect(rows).toEqual([
      { key: 'check:a', later: true },
      { key: 'check:b', later: true },
    ]);
    const again = await boss.send(queue, { trip_id: 'a' }, { singletonKey: 'check:a' });
    expect(again).toBeNull();
  });

  it('reports policy drift it is not told to migrate and leaves the queue alone', async () => {
    const boss = await harness.startRuntime([]);
    const queue = `cp-test-drift-${randomUUID().slice(0, 8)}`;
    await boss.createQueue(queue, { policy: 'exclusive' });
    const drifted = await ensureQueues(boss, [[queue, { ...DEFAULT_QUEUE_SPEC }]]);
    expect(drifted).toEqual([queue]);
    expect((await boss.getQueue(queue))?.policy).toBe('exclusive');
  });
});
