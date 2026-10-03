/**
 * Seeding a trip's Ideas on a real database: the crew's saves inside the destination and the swipe
 * matches not yet on the plan become one idea per place with every saver as a backer, a second run
 * changes nothing, a removed idea stays removed, a member who joins brings their saves, and the
 * destination and join events queue the seed.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { planCheckJob } from '../../src/jobs/planning/check';
import { ideasSeedEventHook, ideasSeedJob, runIdeasSeed } from '../../src/jobs/planning/ideas';
import { backfillIdeas } from '../../src/jobs/planning/ideas/backfill-run';
import {
  insertCrew,
  insertEvent,
  insertUser,
  queuedJobs,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let crewId: string;
let people: string[];
const poi: Record<string, string> = {};

async function liveIdeas() {
  const { rows } = await db.pool.query<{ poi_id: string; backer_ids: string[]; sources: string[] }>(
    `SELECT poi_id, backer_ids, sources FROM trip_ideas
      WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [tripId],
  );
  return rows.map((row) => ({
    poi_id: row.poi_id,
    backers: [...row.backer_ids].sort(),
    sources: [...row.sources].sort(),
  }));
}

const save = (userId: string, poiId: string) =>
  db.pool.query("INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'poi', $2)", [
    userId,
    poiId,
  ]);

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([ideasSeedJob(), planCheckJob()]);
  people = [await insertUser(db.pool), await insertUser(db.pool), await insertUser(db.pool)];
  crewId = await insertCrew(db.pool, people);
  const [bali, lombok] = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, tz) VALUES ('bali', 'Bali', 'Asia/Makassar'),
              ('lombok', 'Lombok', 'Asia/Makassar') RETURNING id`,
    )
  ).rows.map((row) => row.id);
  for (const [key, destination, name] of [
    ['temple', bali, 'Tirta Empul'],
    ['beach', bali, 'Padang Padang'],
    ['placed', bali, 'Ubud Market'],
    ['away', lombok, 'Gili Air'],
    ['late', bali, 'Uluwatu'],
  ] as const) {
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, $2, 'temple_shrine', -8.4, 115.3) RETURNING id`,
      [destination, name],
    );
    poi[key] = rows[0]!.id;
  }
  tripId = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO trips (crew_id, status, destination_id, tz)
       VALUES ($1, 'setup', $2, 'Asia/Makassar') RETURNING id`,
      [crewId, bali],
    )
  ).rows[0]!.id;
  const version = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status)
       VALUES ($1, 'crew', 'current') RETURNING id`,
      [tripId],
    )
  ).rows[0]!.id;
  const day = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date)
       VALUES ($1, $2, 1, '2026-10-13') RETURNING id`,
      [version, tripId],
    )
  ).rows[0]!.id;
  await db.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
                             category, poi_id)
     VALUES ($1, $2, $3, $4, '2026-10-13T02:00Z', '2026-10-13T03:00Z', 'Asia/Makassar', 'other', $5)`,
    [version, day, tripId, randomUUID(), poi['placed']],
  );
  await db.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [version, tripId]);
  const [a, b, c] = people as [string, string, string];
  await save(a, poi['temple']!);
  await save(a, poi['beach']!);
  await save(b, poi['temple']!);
  await save(c, poi['away']!);
  const session = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO swipe_sessions (trip_id, destination_id, started_by, status, match_rule)
       VALUES ($1, $2, $3, 'live', 2) RETURNING id`,
      [tripId, bali, a],
    )
  ).rows[0]!.id;
  await db.pool.query(
    `INSERT INTO swipe_matches (session_id, trip_id, poi_id, user_ids)
     VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
    [session, tripId, poi['beach'], [b, c], poi['placed'], [a, b]],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('ideas.seed', () => {
  it("turns the crew's saves and unplaced matches into one idea per place", async () => {
    const [a, b, c] = people as [string, string, string];
    const changed = await runIdeasSeed(db.pool, { trip_id: tripId });
    expect(changed).toHaveLength(2);
    expect(await liveIdeas()).toEqual([
      { poi_id: poi['beach'], backers: [a, b, c].sort(), sources: ['save', 'swipe'] },
      { poi_id: poi['temple'], backers: [a, b].sort(), sources: ['save'] },
    ]);
    const hints = await db.pool.query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'ideas.changed'",
      [`trip_plan:${tripId}`],
    );
    expect(hints.rowCount).toBe(1);
    expect((await queuedJobs(db.pool, 'plan.check')).length).toBe(1);
  });

  it('changes nothing on a second run and leaves a removed idea removed', async () => {
    expect(await runIdeasSeed(db.pool, { trip_id: tripId })).toEqual([]);
    await db.pool.query(
      'UPDATE trip_ideas SET deleted_at = now() WHERE trip_id = $1 AND poi_id = $2',
      [tripId, poi['temple']],
    );
    expect(await runIdeasSeed(db.pool, { trip_id: tripId })).toEqual([]);
    expect((await liveIdeas()).map((idea) => idea.poi_id)).toEqual([poi['beach']]);
    expect(await backfillIdeas(db.pool)).toEqual({ trips: 1, ideas: 0 });
  });

  it('a member who joins brings their saves, queued by the join event', async () => {
    const newcomer = await insertUser(db.pool);
    await db.pool.query(
      "INSERT INTO crew_members (crew_id, user_id, status) VALUES ($1, $2, 'active')",
      [crewId, newcomer],
    );
    await save(newcomer, poi['late']!);
    await save(newcomer, poi['beach']!);
    const joined = await insertEvent(
      db.pool,
      'crew.member_joined',
      { crew_id: crewId, user_id: newcomer },
      { crewId },
    );
    const destination = await insertEvent(
      db.pool,
      'trip.destination_set',
      { trip_id: tripId },
      { crewId, tripId },
    );
    await withSystem(db.pool, async (tx) => {
      await ideasSeedEventHook(tx, { id: joined, type: 'crew.member_joined' });
      await ideasSeedEventHook(tx, { id: destination, type: 'trip.destination_set' });
      await ideasSeedEventHook(tx, { id: randomUUID(), type: 'chat.message_sent' });
    });
    const queued = await queuedJobs(db.pool, 'ideas.seed');
    expect(queued.map((job) => job.singleton_key).sort()).toEqual(
      [`ideas:${tripId}:${newcomer}`, `ideas:${tripId}:all`].sort(),
    );
    await runIdeasSeed(db.pool, { trip_id: tripId, user_id: newcomer });
    const ideas = await liveIdeas();
    expect(ideas.find((idea) => idea.poi_id === poi['late'])?.backers).toEqual([newcomer]);
    expect(ideas.find((idea) => idea.poi_id === poi['beach'])?.backers).toContain(newcomer);
  });
});
