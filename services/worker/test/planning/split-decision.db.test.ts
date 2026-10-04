/**
 * A split's decision vote closed by its deadline on a real database: the poll close job settles it
 * in the same transaction, the way the crew voted for applies to the plan and the other way is
 * rejected, exactly once, even with the api's hook registered beside the worker's and the deadline
 * timer replayed.
 */
import { randomUUID } from 'node:crypto';

import { onEventAppended, splitDecisionEventHook } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { splitDecisionJobs } from '../../src/jobs/planning/split';
import { closePollAtDeadline } from '../../src/jobs/polls';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let versionId: string;
let pollId: string;
let keen: string;
let instead: string;
let gangga: string;
const NOW = new Date('2026-10-10T02:00:00Z');

const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await db.pool.query(sql, params)).rows as T[];

beforeAll(async () => {
  db = await startNotifyDb();
  splitDecisionJobs();
  // The api registers the same hook in its own process; both firing must settle once.
  onEventAppended(splitDecisionEventHook);
  const people = [await insertUser(db.pool), await insertUser(db.pool), await insertUser(db.pool)];
  const crewId = await insertCrew(db.pool, people);
  const [destination] = await q<{ id: string }>(
    "INSERT INTO destinations (slug, name, tz) VALUES ('bali', 'Bali', 'Asia/Makassar') RETURNING id",
  );
  const place = async (name: string) =>
    (
      await q<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
         VALUES ($1, $2, 'temple_shrine', -8.4, 115.6, 'editorial') RETURNING id`,
        [destination!.id, name],
      )
    )[0]!.id;
  const lempuyang = await place('Pura Lempuyang');
  gangga = await place('Tirta Gangga');
  [{ id: tripId }] = (await q<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, tz) VALUES ($1, 'setup', $2, 'Asia/Makassar')
     RETURNING id`,
    [crewId, destination!.id],
  )) as [{ id: string }];
  [{ id: versionId }] = (await q<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  )) as [{ id: string }];
  await q(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-17')",
    [versionId, tripId],
  );
  await q('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
  const way = async (poiId: string, attendees: string[]) => {
    const id = randomUUID();
    const ops = [
      {
        op: 'add',
        target: randomUUID(),
        after: {
          day_no: 1,
          starts_at: '2026-10-17T08:00:00+08:00',
          ends_at: '2026-10-17T10:00:00+08:00',
          tz: 'Asia/Makassar',
          poi_id: poiId,
          category: 'temple_shrine',
          attendee_ids: attendees,
        },
        reason: 'A way out of the split',
        affected_user_ids: people,
        booking_impact: false,
      },
    ];
    await q(
      `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id, ops)
       VALUES ($1, $2, $3, 'split', 'user', $4, $5)`,
      [id, tripId, versionId, people[0], JSON.stringify(ops)],
    );
    return id;
  };
  keen = await way(lempuyang, people.slice(0, 2));
  instead = await way(gangga, []);
  [{ id: pollId }] = (await q<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, question, created_by, eligible_voter_ids,
       decider_policy, closes_at, allow_change)
     VALUES ($1, $2, 'decision', 'Which way?', $3, $4::uuid[], 'majority_of_affected', $5, true)
     RETURNING id`,
    [crewId, tripId, people[0], people, new Date(NOW.getTime() - 60_000)],
  )) as [{ id: string }];
  const options: string[] = [];
  for (const [position, ref] of [keen, instead].entries()) {
    const [option] = await q<{ id: string }>(
      `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, position)
       VALUES ($1, $2, 'changeset', $3, $4, $5) RETURNING id`,
      [
        pollId,
        crewId,
        ref,
        position === 0 ? 'Keen ones go early' : 'Tirta Gangga instead',
        position,
      ],
    );
    options.push(option!.id);
  }
  for (const set of [keen, instead]) {
    await q("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [set]);
    await q("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [set, pollId]);
  }
  for (const voter of people.slice(1)) {
    await q(
      `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, source, op_id, cast_at)
       VALUES ($1, $2, $3, $4, 'app', $5, $6)`,
      [pollId, options[1], crewId, voter, randomUUID(), NOW],
    );
  }
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('a split decision closed by its deadline', () => {
  it('applies the winning way once and rejects the other', async () => {
    expect(await closePollAtDeadline(db.pool, pollId, NOW)).toBe('closed');
    expect(await closePollAtDeadline(db.pool, pollId, NOW)).toBe('already_closed');
    const status = new Map(
      (
        await q<{ id: string; status: string }>(
          'SELECT id, status FROM change_sets WHERE poll_id = $1',
          [pollId],
        )
      ).map((row) => [row.id, row.status]),
    );
    expect(status.get(instead)).toBe('applied');
    expect(status.get(keen)).toBe('rejected');
    const applied = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'change_set.applied' AND payload->>'change_set_id' = $1`,
      [instead],
    );
    expect(applied[0]!.n).toBe(1);
    const versions = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM itinerary_versions WHERE trip_id = $1',
      [tripId],
    );
    expect(versions[0]!.n).toBe(2);
    const added = await q(
      `SELECT 1 FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 AND i.poi_id = $2`,
      [tripId, gangga],
    );
    expect(added).toHaveLength(1);
  });
});
