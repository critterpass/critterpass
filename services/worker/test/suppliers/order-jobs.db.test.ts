/**
 * The supplier order jobs against a migrated Postgres. A hold reaching its expiry timer ends
 * `hold_expired`, tells the holder, and closes the open vote on the held plan item (the plan is
 * kept); a replayed timer or a released hold changes nothing. The Viator status poll hands the api
 * exactly the orders waiting on the operator whose next poll is due, and one failing order does
 * not stop the rest.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireHold } from '../../src/jobs/suppliers/hold-expiry';
import { pollViatorOrders } from '../../src/jobs/suppliers/viator-poll';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let tripId: string;
let crewId: string;
let users: string[];

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await harness.pool.query(sql, params);
  if (rows[0] === undefined) throw new Error(`no row: ${sql}`);
  return rows[0] as T;
}

async function order(status: string, extra: { stable?: string; nextPoll?: Date | null } = {}) {
  const { id } = await one<{ id: string }>(
    `INSERT INTO supplier_orders (trip_id, buyer_id, supplier, stable_id, partner_cart_ref,
       hold_valid_until, next_poll_at)
     VALUES ($1, $2, 'viator', $3, $4, now() + interval '2 minutes', $5) RETURNING id`,
    [
      tripId,
      users[0],
      extra.stable ?? null,
      `probe${randomUUID().slice(0, 12)}`,
      extra.nextPoll ?? null,
    ],
  );
  // Walk the machine to `status` (the trigger refuses shortcuts).
  const path: Record<string, string[]> = {
    holding: ['holding'],
    released: ['holding', 'released'],
    booking: ['holding', 'booking'],
    pending_operator: ['holding', 'booking', 'pending_operator'],
    confirmed: ['holding', 'booking', 'confirmed'],
  };
  for (const step of path[status] ?? []) {
    await harness.pool.query('UPDATE supplier_orders SET status = $2 WHERE id = $1', [id, step]);
  }
  return id;
}

async function votingChangeSet(stable: string): Promise<{ id: string; pollId: string }> {
  const version = await one<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const ops = [
    {
      op: 'retime',
      target: stable,
      after: { starts_at: '2027-04-05T16:00:00Z', ends_at: '2027-04-05T17:00:00Z' },
      reason: 'later',
      affected_user_ids: [],
      booking_impact: false,
    },
  ];
  const { id } = await one<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
     VALUES ($1, $2, 'manual', 'user', $3, $4) RETURNING id`,
    [tripId, version.id, users[0], JSON.stringify(ops)],
  );
  await harness.pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [id]);
  const poll = await one<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, created_by, eligible_voter_ids, decider_policy, closes_at)
     VALUES ($1, $2, 'changeset_approval', $3, $4::uuid[], 'majority_of_affected',
       now() + interval '1 hour') RETURNING id`,
    [crewId, tripId, users[0], users],
  );
  await harness.pool.query(
    `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, position)
     VALUES ($1, $2, 'changeset', $3, 'yes', 0), ($1, $2, 'text', NULL, 'no', 1)`,
    [poll.id, crewId, id],
  );
  await harness.pool.query("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [
    id,
    poll.id,
  ]);
  return { id, pollId: poll.id };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  users = [randomUUID(), randomUUID()];
  for (const id of users) {
    await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  }
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Supplier crew', $1) RETURNING id",
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

describe('supplier.hold_expiry', () => {
  it('ends the hold, tells the holder and closes the vote on the held item', async () => {
    const stable = randomUUID();
    const id = await order('holding', { stable });
    const vote = await votingChangeSet(stable);

    expect(await expireHold(harness.pool, id)).toBe('expired');
    expect(await one('SELECT status FROM supplier_orders WHERE id = $1', [id])).toEqual({
      status: 'hold_expired',
    });
    expect(await one('SELECT status FROM polls WHERE id = $1', [vote.pollId])).toEqual({
      status: 'closed',
    });
    expect(await one('SELECT status FROM change_sets WHERE id = $1', [vote.id])).toEqual({
      status: 'rejected',
    });
    const events = await harness.pool.query(
      `SELECT type FROM domain_events WHERE aggregate_id = $1 ORDER BY id`,
      [id],
    );
    expect(events.rows.map((row: { type: string }) => row.type)).toEqual([
      'hold.expiring',
      'activity.hold_expired',
    ]);

    expect(await expireHold(harness.pool, id)).toBe('gone');
  });

  it('leaves a released hold alone', async () => {
    const id = await order('released');
    expect(await expireHold(harness.pool, id)).toBe('gone');
    expect(await one('SELECT status FROM supplier_orders WHERE id = $1', [id])).toEqual({
      status: 'released',
    });
  });
});

describe('supplier.viator_poll', () => {
  it('settles only orders waiting on Viator whose poll is due, past a failing one', async () => {
    const now = new Date();
    const due = await order('pending_operator', { nextPoll: new Date(now.getTime() - 1000) });
    const lost = await order('booking');
    const later = await order('pending_operator', { nextPoll: new Date(now.getTime() + 60_000) });
    const done = await order('confirmed');
    const asked: string[] = [];
    const outcome = await pollViatorOrders(
      harness.pool,
      {
        settle: (id) => {
          asked.push(id);
          return id === lost ? Promise.reject(new Error('api down')) : Promise.resolve();
        },
      },
      now,
    );
    expect(new Set(asked)).toEqual(new Set([due, lost]));
    expect(asked).not.toContain(later);
    expect(asked).not.toContain(done);
    expect(outcome).toEqual({ settled: 1, failed: 1 });
  });
});
