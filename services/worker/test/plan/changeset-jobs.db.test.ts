/**
 * The plan jobs against a migrated Postgres: after a new version, a pending change set on an item
 * nobody touched is rebased onto it and one on an item that moved goes stale (its vote closed);
 * an approval vote still undecided at its deadline keeps the plan, once.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireChangeSet } from '../../src/jobs/plan/changeset-expiry';
import { sweepStaleChangeSets } from '../../src/jobs/plan/stale-sweep';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let tripId: string;
let crewId: string;
let users: string[];
const stable = { walk: randomUUID(), museum: randomUUID() };

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await harness.pool.query(sql, params);
  if (rows[0] === undefined) throw new Error(`no row: ${sql}`);
  return rows[0] as T;
}

/** A crew-visible version with one day; the walk starts at `walkHour` UTC. */
async function version(parent: string | null, walkHour: number): Promise<string> {
  const { id } = await one<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, parent_id, visibility, status)
     VALUES ($1, $2, 'crew', 'current') RETURNING id`,
    [tripId, parent],
  );
  const day = await one<{ id: string }>(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2027-04-05') RETURNING id",
    [id, tripId],
  );
  for (const [key, hour] of [
    ['walk', walkHour],
    ['museum', 13],
  ] as const) {
    await harness.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, category)
       VALUES ($1, $2, $3, $4, $5, $6, 'activity')`,
      [
        id,
        day.id,
        tripId,
        stable[key],
        `2027-04-05T${String(hour).padStart(2, '0')}:00:00Z`,
        `2027-04-05T${String(hour + 1).padStart(2, '0')}:00:00Z`,
      ],
    );
  }
  return id;
}

async function changeSet(
  base: string,
  target: string,
  status: 'proposed' | 'voting',
): Promise<string> {
  const ops = [
    {
      op: 'retime',
      target,
      after: { starts_at: '2027-04-05T16:00:00Z', ends_at: '2027-04-05T17:00:00Z' },
      reason: 'later',
      affected_user_ids: [],
      booking_impact: false,
    },
  ];
  const { id } = await one<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
     VALUES ($1, $2, 'manual', 'user', $3, $4) RETURNING id`,
    [tripId, base, users[0], JSON.stringify(ops)],
  );
  await harness.pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [id]);
  if (status === 'voting') {
    const poll = await one<{ id: string }>(
      `INSERT INTO polls (crew_id, trip_id, kind, created_by, eligible_voter_ids, decider_policy,
         closes_at)
       VALUES ($1, $2, 'changeset_approval', $3, $4::uuid[], 'majority_of_affected',
         now() - interval '1 minute') RETURNING id`,
      [crewId, tripId, users[0], users],
    );
    await harness.pool.query(
      `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, position)
       VALUES ($1, $2, 'changeset', $3, 'yes', 0), ($1, $2, 'text', NULL, 'no', 1)`,
      [poll.id, crewId, id],
    );
    await harness.pool.query(
      "UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1",
      [id, poll.id],
    );
  }
  return id;
}

const statusOf = async (id: string) =>
  one<{ status: string; base_version_id: string }>(
    'SELECT status, base_version_id FROM change_sets WHERE id = $1',
    [id],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  users = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of users) {
    await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  }
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Plan crew', $1) RETURNING id",
    [users[0]],
  ));
  ({ id: tripId } = await one<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  ));
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('plan.stale_sweep', () => {
  it('rebases a set on untouched items and marks one on a moved item stale', async () => {
    const v1 = await version(null, 9);
    const untouched = await changeSet(v1, stable.museum, 'proposed');
    const clashing = await changeSet(v1, stable.walk, 'voting');
    const v2 = await version(v1, 10);
    await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      tripId,
      v2,
    ]);

    expect(await sweepStaleChangeSets(harness.pool, tripId)).toEqual({ rebased: 1, stale: 1 });
    expect(await statusOf(untouched)).toEqual({ status: 'proposed', base_version_id: v2 });
    expect((await statusOf(clashing)).status).toBe('stale');
    const poll = await one<{ status: string }>(
      'SELECT p.status FROM polls p JOIN change_sets cs ON cs.poll_id = p.id WHERE cs.id = $1',
      [clashing],
    );
    expect(poll.status).toBe('closed');
    expect(await sweepStaleChangeSets(harness.pool, tripId)).toEqual({ rebased: 0, stale: 0 });
  });
});

describe('plan.changeset_expiry', () => {
  it('keeps the plan when the vote is still undecided at its deadline, once', async () => {
    const current = await one<{ v: string }>(
      'SELECT current_version_id AS v FROM trips WHERE id = $1',
      [tripId],
    );
    const id = await changeSet(current.v, stable.museum, 'voting');
    expect(await expireChangeSet(harness.pool, id)).toBe('expired');
    expect((await statusOf(id)).status).toBe('rejected');
    const events = await one<{ n: number }>(
      "SELECT count(*)::int AS n FROM domain_events WHERE type = 'change_set.expired' AND aggregate_id = $1",
      [id],
    );
    expect(events.n).toBe(1);
    expect(await expireChangeSet(harness.pool, id)).toBe('settled');
  });
});
