/**
 * A plan born from the guide's draft gets its legs: when the draft job appends `draft.ready` for
 * the version it saved, the worker's event hook queues one debounced `plan.legs` run for the trip
 * in the same transaction.
 */
import { randomUUID } from 'node:crypto';

import { appendDomainEvent, onEventAppended, withSystem } from '@cp/db';
import { createPlanningTravel } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { legsEventHook } from '../../src/jobs/planning/legs';
import { planLegsJob } from '../../src/jobs/planning/legs/job';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let owner: string;

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  owner = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  await harness.startRuntime([planLegsJob(createPlanningTravel({ valhalla: null }))]);
  onEventAppended(legsEventHook);
}, 240_000);

afterAll(async () => {
  await harness?.stopAll();
  await harness?.close();
});

describe('plan.legs triggers', () => {
  it('queues one run for the trip when the guide’s draft is ready', async () => {
    const crewId = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
      'Da Nang',
      owner,
    ]);
    const tripId = await one(
      `INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id`,
      [crewId],
    );
    const versionId = await one(
      `INSERT INTO itinerary_versions (trip_id, visibility, status)
       VALUES ($1, 'organiser', 'draft') RETURNING id`,
      [tripId],
    );
    await harness.pool.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [
      tripId,
      versionId,
    ]);
    const ready = () =>
      withSystem(harness.pool, (tx) =>
        appendDomainEvent(tx, {
          type: 'draft.ready',
          aggregateKind: 'trip',
          aggregateId: tripId,
          actorKind: 'system',
          actorId: null,
          crewId,
          tripId,
          payload: { trip_id: tripId, job_id: randomUUID(), version_id: versionId, user_id: owner },
        }),
      );
    await ready();
    const { rows } = await harness.pool.query<{ data: unknown; key: string; later: boolean }>(
      `SELECT data, singleton_key AS key, start_after > now() + interval '20 seconds' AS later
         FROM pgboss.job WHERE name = 'plan.legs' AND data ->> 'trip_id' = $1`,
      [tripId],
    );
    expect(rows).toEqual([
      { data: { trip_id: tripId, version_id: versionId }, key: `legs:${tripId}`, later: true },
    ]);
  });
});
