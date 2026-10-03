/**
 * Tokek placing ideas on a real database: the job ticks its four steps, places the ideas that fit
 * without moving anything into one private draft change set authored by the requester (trigger
 * `ideas`, never a redraft), leaves the split idea and the one nowhere fits for the person with
 * why, keeps the booked day exactly as it was, makes no model call, and appends `ideas.placed`.
 */
import { randomUUID } from 'node:crypto';

import { startAgentJob } from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import { changeSetOpsSchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PLACE_IDEAS_STEP_IDS, placeIdeasJob } from '../../src/jobs/planning/ideas';
import { insertCrew, insertUser, startNotifyDb, until, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let tripId: string;
let versionId: string;
let people: string[];
const ideas: Record<string, string> = {};
const DAILY = JSON.stringify({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '08:00', end: '18:00' }]]),
  ),
});

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss([placeIdeasJob()]);
  people = [await insertUser(db.pool), await insertUser(db.pool), await insertUser(db.pool)];
  const crewId = await insertCrew(db.pool, people);
  const destination = (
    await db.pool.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, tz) VALUES ('bali', 'Bali', 'Asia/Makassar') RETURNING id",
    )
  ).rows[0]!.id;
  tripId = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO trips (crew_id, status, destination_id, tz)
       VALUES ($1, 'setup', $2, 'Asia/Makassar') RETURNING id`,
      [crewId, destination],
    )
  ).rows[0]!.id;
  versionId = (
    await db.pool.query<{ id: string }>(
      "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
      [tripId],
    )
  ).rows[0]!.id;
  const days = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date)
       VALUES ($1, $2, 1, '2026-10-15'), ($1, $2, 2, '2026-10-16'), ($1, $2, 3, '2026-10-17')
       RETURNING id`,
      [versionId, tripId],
    )
  ).rows;
  // Day 1 (Thursday, arrival) is a booked tour from 08:00 to 20:00 that nothing moves; day 2 is
  // free; day 3 is the morning the crew leaves.
  await db.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, category,
                             locked_reason)
     VALUES ($1, $2, $3, $4, '2026-10-15T00:00Z', '2026-10-15T12:00Z', 'Asia/Makassar', 'other',
             'booked')`,
    [versionId, days[0]!.id, tripId, randomUUID()],
  );
  await db.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    versionId,
    tripId,
  ]);
  const places: [string, string, number, string][] = [
    ['temple', 'temple_shrine', 0.01, DAILY],
    ['museum', 'museum', 0.02, DAILY],
    ['split', 'food', 0.03, DAILY],
    // Open only on Thursdays, the booked day.
    [
      'thursday',
      'market',
      0.04,
      JSON.stringify({ weekly: { th: [{ start: '09:00', end: '12:00' }] } }),
    ],
  ];
  for (const [key, category, offset, hours] of places) {
    const poi = (
      await db.pool.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, hours, editorial)
         VALUES ($1, $2, $3, $4, 115.26, $5, '{"time_needed_min": 60}') RETURNING id`,
        [destination, key, category, -8.5 + offset, hours],
      )
    ).rows[0]!.id;
    ideas[key] = (
      await db.pool.query<{ id: string }>(
        `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
         VALUES ($1, $2, $3, $4, $5, 115.26, $6, '{save}') RETURNING id`,
        [tripId, poi, key, category, -8.5 + offset, [people[0]]],
      )
    ).rows[0]!.id;
    if (key === 'split') {
      await db.pool.query(
        `INSERT INTO place_stances (trip_id, poi_id, user_id, stance)
         VALUES ($1, $2, $3, 'want'), ($1, $2, $4, 'rather_not')`,
        [tripId, poi, people[0], people[1]],
      );
    }
  }
  ideas['pin'] = (
    await db.pool.query<{ id: string }>(
      `INSERT INTO trip_ideas (trip_id, name, category, lat, lng, backer_ids, sources)
       VALUES ($1, 'Our ramen spot', 'other', -8.49, 115.27, $2, '{pin}') RETURNING id`,
      [tripId, [people[1]]],
    )
  ).rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('ai.place_ideas', () => {
  it('places what fits into one private draft and leaves the rest with why', async () => {
    const requester = people[0]!;
    const job = await withSystem(db.pool, (tx) =>
      startAgentJob(tx, (queue, data, options) => sendInTx(tx, queue, data, options), {
        kind: 'place_ideas',
        queue: 'ai.place_ideas',
        userId: requester,
        tripId,
        input: { trip_id: tripId, idea_ids: null, version_id: versionId },
        stepIds: PLACE_IDEAS_STEP_IDS,
        baseVersionId: versionId,
      }),
    );
    const row = async () =>
      (
        await db.pool.query<{
          status: string;
          steps: { step: string; status: string }[];
          partial: Record<string, unknown>;
          result_ref: { change_set_id: string } | null;
        }>('SELECT status, steps, partial, result_ref FROM agent_jobs WHERE id = $1', [job.id])
      ).rows[0]!;
    await until(async () => ['succeeded', 'failed'].includes((await row()).status), 60_000);
    const done = await row();
    expect(done.status, JSON.stringify(done.steps)).toBe('succeeded');
    expect(done.steps.map((s) => [s.step, s.status])).toEqual(
      PLACE_IDEAS_STEP_IDS.map((id) => [id, 'done']),
    );

    const changeSetId = done.result_ref?.change_set_id;
    const { rows: sets } = await db.pool.query<{
      trigger: string;
      status: string;
      author_id: string;
      author_kind: string;
      ops: unknown;
    }>('SELECT trigger, status, author_id, author_kind, ops FROM change_sets WHERE id = $1', [
      changeSetId,
    ]);
    expect(sets[0]).toMatchObject({
      trigger: 'ideas',
      status: 'draft',
      author_id: requester,
      author_kind: 'user',
    });
    const ops = changeSetOpsSchema.parse(sets[0]!.ops);
    const placed = ops.map((op) => op.source_ids?.find((s) => s.startsWith('idea:'))).sort();
    expect(placed).toEqual(
      [ideas['temple'], ideas['museum'], ideas['pin']].map((id) => `idea:${id}`).sort(),
    );
    for (const op of ops) expect(op.after?.day_no).toBe(2);
    expect(ops.find((op) => op.after?.poi_id === null)?.after?.custom_place).toMatchObject({
      name: 'Our ramen spot',
    });

    const left = (done.partial['needs_you'] as { left: { idea_id: string; reason: string }[] })
      .left;
    expect(left.map((l) => [l.idea_id, l.reason]).sort()).toEqual(
      [
        [ideas['split'], 'split'],
        [ideas['thursday'], 'no_day'],
      ].sort(),
    );

    const { rows: items } = await db.pool.query(
      'SELECT count(*)::int AS n FROM plan_items WHERE version_id = $1',
      [versionId],
    );
    expect(items[0]).toEqual({ n: 1 });
    const { rows: usage } = await db.pool.query('SELECT 1 FROM ai_usage WHERE job_id = $1', [
      job.id,
    ]);
    expect(usage).toHaveLength(0);
    const { rows: redrafts } = await db.pool.query<{ redrafts_used: number }>(
      'SELECT redrafts_used FROM trips WHERE id = $1',
      [tripId],
    );
    expect(redrafts[0]?.redrafts_used).toBe(0);
    const { rows: events } = await db.pool.query(
      "SELECT payload FROM domain_events WHERE type = 'ideas.placed' AND trip_id = $1",
      [tripId],
    );
    expect(events).toEqual([
      {
        payload: {
          trip_id: tripId,
          job_id: job.id,
          user_id: requester,
          change_set_id: changeSetId,
        },
      },
    ]);
  });
});
