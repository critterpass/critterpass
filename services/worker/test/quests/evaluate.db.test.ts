/**
 * Quest progress against a migrated Postgres: events move quests by the distinct things they count,
 * a repeated event never counts twice, finishing grants the XP once with a shared reveal moment,
 * a dropped traveller lowers a crew quest's bar, and visits outside the audience or the day count
 * for nothing.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateEvent } from '../../src/jobs/quests/evaluate';
import { PLACES, startQuestWorld, type QuestWorld } from './quests-world';

let world: QuestWorld;

beforeAll(async () => {
  world = await startQuestWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

let slot = 0;

// Live for the next 12 hours whatever the clock says when the suite runs.
const ends = new Date(Date.now() + 12 * 3_600_000);

async function quest(template: string, params: Record<string, unknown>, count: number, xp = 100) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO quests (trip_id, local_date, slot, template, params, metric, target, reward, title,
       body, source, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, 'test', $6, $7, 'TEST QUEST', 'A quest.', 'fallback', $8, $9)
     RETURNING id`,
    [
      world.tripId,
      world.today,
      slot,
      template,
      params,
      count,
      { xp, sticker: null, form_id: null },
      world.at('00:00'),
      ends,
    ],
  );
  slot += 1;
  return row?.id as string;
}

const state = async (id: string) =>
  (
    await world.q<{ status: string; value: number; reveal_at: Date | null; completed_at: Date }>(
      `SELECT q.status, p.value, q.reveal_at, q.completed_at FROM quests q
         LEFT JOIN quest_progress p ON p.quest_id = q.id WHERE q.id = $1`,
      [id],
    )
  )[0];

const visited = async (uid: string, poi: string) =>
  world.event('visit.recorded', {
    visit_id: await world.visit(uid, poi, new Date()),
    trip_id: world.tripId,
    source: 'geofence',
  });

const questXp = (id: string) =>
  world.q<{ user_id: string | null; amount: number }>(
    "SELECT user_id, amount FROM xp_ledger WHERE source_kind = 'quest' AND source_id = $1",
    [id],
  );

describe('quest.evaluate', () => {
  it('counts distinct places, ignores a repeated event and finishes once', async () => {
    const [a, b] = world.members as [string, string];
    const id = await quest('visit_any_of', { poi_ids: [PLACES.bana, PLACES.han], n: 2 }, 2, 120);
    const first = await visited(a, PLACES.bana);
    await evaluateEvent(world.harness.pool, first);
    await evaluateEvent(world.harness.pool, first);
    expect((await state(id))?.value).toBe(1);
    await evaluateEvent(world.harness.pool, await visited(b, PLACES.bana));
    expect((await state(id))?.value).toBe(1);
    const last = await visited(b, PLACES.han);
    const now = new Date();
    await evaluateEvent(world.harness.pool, last, now);
    await evaluateEvent(world.harness.pool, last, now);
    const done = await state(id);
    expect(done).toMatchObject({ status: 'completed', value: 2 });
    expect(done?.reveal_at?.getTime()).toBe(now.getTime() + 1500);
    const rows = await questXp(id);
    expect(rows.filter((r) => r.user_id === null)).toEqual([{ user_id: null, amount: 120 }]);
    expect(rows.filter((r) => r.user_id !== null)).toHaveLength(4);
    const reward = await world.q<{ data: { reveal_at: string; xp: number } }>(
      `SELECT payload->'data' AS data FROM rt_outbox
        WHERE channel = $1 AND payload->>'type' = 'reward' ORDER BY id DESC LIMIT 1`,
      [`trip_quests:${world.tripId}`],
    );
    expect(reward[0]?.data).toMatchObject({ xp: 120, reveal_at: done?.reveal_at?.toISOString() });
    const completed = (
      await world.harness.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM domain_events WHERE type = 'quest.completed' AND aggregate_id = $1",
        [id],
      )
    ).rows;
    expect(completed[0]?.n).toBe(1);
  });

  it('counts only travellers on the trip, inside the quest day', async () => {
    const id = await quest('visit_poi', { poi_id: PLACES.mykhe }, 1);
    const outsider = randomUUID();
    await world.q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Out')", [
      outsider,
    ]);
    await world.harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'out')",
      [world.tripId, outsider],
    );
    await evaluateEvent(world.harness.pool, await visited(outsider, PLACES.mykhe));
    expect((await state(id))?.value).toBe(0);
    const late = await world.visit(
      world.members[1] as string,
      PLACES.mykhe,
      new Date(ends.getTime() + 60_000),
    );
    await evaluateEvent(
      world.harness.pool,
      await world.event('visit.recorded', {
        visit_id: late,
        trip_id: world.tripId,
        source: 'geofence',
      }),
    );
    expect((await state(id))?.status).toBe('active');
  });

  it('lowers a crew quest bar when a traveller drops out', async () => {
    const [a, b, c, d] = world.members as [string, string, string, string];
    const id = await quest('copresence', { poi_id: PLACES.han, by_time: '20:00' }, 4);
    await evaluateEvent(world.harness.pool, await visited(a, PLACES.han));
    await evaluateEvent(world.harness.pool, await visited(b, PLACES.han));
    await world.harness.pool.query(
      "UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2",
      [world.tripId, d],
    );
    await evaluateEvent(world.harness.pool, await visited(c, PLACES.han));
    expect((await state(id))?.status).toBe('completed');
    const members = (await questXp(id)).filter((r) => r.user_id !== null).map((r) => r.user_id);
    expect(members.sort()).toEqual([a, b, c].sort());
    await world.harness.pool.query(
      "UPDATE trip_participants SET rsvp = 'in' WHERE trip_id = $1 AND user_id = $2",
      [world.tripId, d],
    );
  });
});
