/**
 * A plan change put to the crew's vote, in the inbox and in crew chat: everyone who can vote and
 * has not (never the author) holds a card naming the change until they vote or the vote closes;
 * the close tells everyone what was decided, once, with a line in crew chat. Real database, the
 * real fan-out.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent } from '../../src/jobs/inbox/fanout';
import { registerPlanInboxFanouts } from '../../src/jobs/plan/inbox';
import { registerPollFanouts } from '../../src/jobs/polls/result-fanout';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { insertEvent } from '../notify-fixtures';

let harness: JobsHarness;
let linh: string;
let minh: string;
let crewId: string;
let tripId: string;
let versionId: string;
let poiId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await harness.pool.query(sql, params);
  if (rows[0] === undefined) throw new Error(`no row: ${sql}`);
  return rows[0] as T;
}
const all = async <T>(sql: string, params: unknown[] = []) =>
  (await harness.pool.query(sql, params)).rows as T[];

/** Minh suggests Bà Nà Hills for Wednesday 07:00 (Đà Nẵng time); the vote is open to both. */
async function suggestion(): Promise<{ changeSetId: string; pollId: string }> {
  const ops = [
    {
      op: 'add',
      target: randomUUID(),
      after: { day_no: 3, starts_at: '2026-10-21T00:00:00Z', poi_id: poiId },
      reason: 'manual',
      affected_user_ids: [linh, minh],
      booking_impact: false,
    },
  ];
  const { id } = await one<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
     VALUES ($1, $2, 'manual', 'user', $3, $4) RETURNING id`,
    [tripId, versionId, minh, JSON.stringify(ops)],
  );
  const poll = await one<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, created_by, eligible_voter_ids, decider_policy, closes_at)
     VALUES ($1, $2, 'changeset_approval', $3, $4::uuid[], 'majority_of_affected',
       now() + interval '1 day') RETURNING id`,
    [crewId, tripId, minh, [linh, minh]],
  );
  await harness.pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [id]);
  await harness.pool.query("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [
    id,
    poll.id,
  ]);
  return { changeSetId: id, pollId: poll.id };
}

const event = (type: string, changeSetId: string, actorId?: string) =>
  insertEvent(
    harness.pool,
    type,
    { trip_id: tripId, change_set_id: changeSetId },
    { crewId, tripId, ...(actorId === undefined ? {} : { actorId }) },
  );

interface Item {
  readonly user_id: string;
  readonly kind: string;
  readonly needs_you: boolean;
  readonly open: boolean;
  readonly deep_link: string | null;
  readonly data: Record<string, unknown>;
}
const itemsOf = (changeSetId: string) =>
  all<Item>(
    `SELECT user_id, kind, needs_you, resolved_at IS NULL AS open, deep_link, data
       FROM inbox_items WHERE data->>'change_set_id' = $1 ORDER BY created_at, kind`,
    [changeSetId],
  );
const linesOf = (changeSetId: string) =>
  all<{ ref_kind: string; body: string }>(
    "SELECT ref_kind, body FROM messages WHERE type = 'system' AND ref_id = $1 ORDER BY seq",
    [changeSetId],
  );

beforeAll(async () => {
  harness = await startJobsHarness();
  registerPlanInboxFanouts();
  registerPollFanouts();
  [linh, minh] = [randomUUID(), randomUUID()];
  for (const [id, name] of [
    [linh, 'Linh Tran'],
    [minh, 'Minh Le'],
  ] as const) {
    await harness.pool.query(
      "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)",
      [id, name],
    );
  }
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Da Nang gang', $1) RETURNING id",
    [linh],
  ));
  for (const uid of [linh, minh]) {
    await harness.pool.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [
      crewId,
      uid,
    ]);
  }
  const destination = await one<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('da-nang-inbox', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  ({ id: poiId } = await one<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Bà Nà Hills', 'other', 15.99, 107.99) RETURNING id`,
    [destination.id],
  ));
  ({ id: tripId } = await one<{ id: string }>(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
    [crewId, destination.id],
  ));
  ({ id: versionId } = await one<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status)
     VALUES ($1, 'crew', 'current') RETURNING id`,
    [tripId],
  ));
  await harness.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
    tripId,
    versionId,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('a plan change put to a vote', () => {
  it('needs everyone who can vote, never its author, and names the change', async () => {
    const { changeSetId, pollId } = await suggestion();
    const eventId = await event('change_set.proposed', changeSetId, minh);
    expect(await fanOutEvent(harness.pool, eventId)).toMatchObject({ filed: 1 });
    expect(await fanOutEvent(harness.pool, eventId)).toMatchObject({ filed: 0 });
    expect(await itemsOf(changeSetId)).toMatchObject([
      {
        user_id: linh,
        kind: 'plan_change.vote_needed',
        needs_you: true,
        open: true,
        deep_link: `/trip/${tripId}/review/${changeSetId}`,
        data: {
          poll_id: pollId,
          op: 'add',
          title: 'Bà Nà Hills',
          date: '2026-10-21',
          time: '07:00',
          count: 1,
        },
      },
    ]);

    // Her vote settles it, from whichever surface she votes.
    const ballot = await insertEvent(
      harness.pool,
      'ballot.cast',
      { poll_id: pollId, user_id: linh },
      { crewId, tripId, actorId: linh },
    );
    expect(await fanOutEvent(harness.pool, ballot)).toMatchObject({ resolved: 1 });
    expect((await itemsOf(changeSetId))[0]?.open).toBe(false);
  });

  it('tells everyone what went in when the crew says yes, with one chat line', async () => {
    const { changeSetId } = await suggestion();
    await fanOutEvent(harness.pool, await event('change_set.proposed', changeSetId, minh));
    const applied = await event('change_set.applied', changeSetId, linh);
    expect(await fanOutEvent(harness.pool, applied)).toMatchObject({ filed: 2 });
    await fanOutEvent(harness.pool, applied);

    const items = await itemsOf(changeSetId);
    // The card that was waiting for a vote has nothing left to ask.
    expect(items.find((item) => item.kind === 'plan_change.vote_needed')?.open).toBe(false);
    const decided = items.filter((item) => item.kind === 'plan_change.applied');
    expect(decided.map((item) => item.user_id).sort()).toEqual([linh, minh].sort());
    expect(decided[0]).toMatchObject({
      needs_you: false,
      data: { outcome: 'applied', title: 'Bà Nà Hills', date: '2026-10-21', time: '07:00' },
    });
    expect(await linesOf(changeSetId)).toEqual([
      { ref_kind: 'plan_added', body: 'Bà Nà Hills · 2026-10-21 07:00' },
    ]);
  });

  it('says the plan stays as it was when the crew says no or the vote runs out', async () => {
    const no = await suggestion();
    await fanOutEvent(harness.pool, await event('change_set.rejected', no.changeSetId, linh));
    expect((await linesOf(no.changeSetId)).map((line) => line.ref_kind)).toEqual(['plan_kept']);
    expect((await itemsOf(no.changeSetId)).map((item) => item.kind)).toEqual([
      'plan_change.kept',
      'plan_change.kept',
    ]);

    const late = await suggestion();
    await fanOutEvent(harness.pool, await event('change_set.expired', late.changeSetId));
    expect((await linesOf(late.changeSetId)).map((line) => line.ref_kind)).toEqual([
      'plan_vote_ran_out',
    ]);
  });

  it('is not also reported as a bare vote result', async () => {
    const { pollId } = await suggestion();
    await harness.pool.query("UPDATE polls SET status = 'closed' WHERE id = $1", [pollId]);
    const closed = await insertEvent(
      harness.pool,
      'poll.closed',
      { poll_id: pollId },
      { crewId, tripId },
    );
    expect(await fanOutEvent(harness.pool, closed)).toMatchObject({ filed: 0 });
  });

  it('files nothing for a change that never went to a vote', async () => {
    const { id } = await one<{ id: string }>(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, ops)
       VALUES ($1, $2, 'manual', 'user', $3, '[]') RETURNING id`,
      [tripId, versionId, linh],
    );
    expect(
      await fanOutEvent(harness.pool, await event('change_set.applied', id, linh)),
    ).toMatchObject({
      filed: 0,
    });
    expect(await linesOf(id)).toEqual([]);
  });
});
