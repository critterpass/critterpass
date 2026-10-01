/**
 * A crew's quest day end to end against a migrated Postgres: the morning job publishes the guide's
 * recorded quests for a Da Nang day, three travellers check in at the day's places, each check-in
 * moves the pips on every phone (a `quest.progress` hint per step), the last one finishes the
 * quest once, pays the crew and each traveller its XP, and sends one `reward` hint whose
 * `reveal_at` is the shared moment every phone spins it at.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateEvent } from '../../src/jobs/quests/evaluate';
import { generateQuests } from '../../src/jobs/quests/generate';
import { PLACES, startQuestWorld, type QuestWorld } from './quests-world';
import { recordedWriter } from './recorded-writer';

let world: QuestWorld;

beforeAll(async () => {
  world = await startQuestWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

interface Hint {
  type: string;
  data: { quest_id?: string; value?: number; xp?: number; reveal_at?: string };
}

const hints = async () =>
  (
    await world.harness.pool.query<{ payload: Hint }>(
      'SELECT payload FROM rt_outbox WHERE channel = $1 ORDER BY id',
      [`trip_quests:${world.tripId}`],
    )
  ).rows.map((row) => row.payload);

describe('a quest day', () => {
  it('publishes, moves live with each check-in and pays the crew once at a shared moment', async () => {
    const published = await generateQuests(
      world.harness.pool,
      { trip_id: world.tripId, local_date: world.today },
      { writer: recordedWriter('quests-01') },
    );
    expect(published.outcome).toBe('published');
    const [sweep] = await world.q<{ id: string; target: number; reward: { xp: number } }>(
      "SELECT id, target, reward FROM quests WHERE trip_id = $1 AND template = 'visit_any_of'",
      [world.tripId],
    );
    expect(sweep?.target).toBe(3);

    const [a, b, c] = world.members as [string, string, string];
    const stops: [string, string][] = [
      [a, PLACES.bana],
      [b, PLACES.mykhe],
      [c, PLACES.han],
    ];
    let last = '';
    for (const [uid, poi] of stops) {
      last = await world.event('visit.recorded', {
        visit_id: await world.visit(uid, poi, new Date()),
        trip_id: world.tripId,
        source: 'geofence',
      });
      await evaluateEvent(world.harness.pool, last);
    }
    await evaluateEvent(world.harness.pool, last);

    const onChannel = (await hints()).filter((hint) => hint.data.quest_id === sweep?.id);
    expect(
      onChannel.filter((hint) => hint.type === 'quest.progress').map((hint) => hint.data.value),
    ).toEqual([1, 2, 3]);
    const rewards = onChannel.filter((hint) => hint.type === 'reward');
    expect(rewards).toHaveLength(1);
    const [quest] = await world.q<{ status: string; reveal_at: Date }>(
      'SELECT status, reveal_at FROM quests WHERE id = $1',
      [sweep?.id],
    );
    expect(quest?.status).toBe('completed');
    expect(rewards[0]?.data.reveal_at).toBe(quest?.reveal_at.toISOString());

    const xp = sweep?.reward.xp ?? 0;
    const paid = await world.q<{ user_id: string | null; amount: number }>(
      "SELECT user_id, amount FROM xp_ledger WHERE source_kind = 'quest' AND source_id = $1",
      [sweep?.id],
    );
    expect(paid.filter((row) => row.user_id === null)).toEqual([{ user_id: null, amount: xp }]);
    expect(paid.filter((row) => row.user_id !== null)).toHaveLength(world.members.length);
    const [crew] = await world.q<{ xp: string; ledger: string }>(
      `SELECT x.xp, (SELECT sum(amount) FROM xp_ledger
                      WHERE crew_id = x.crew_id AND user_id IS NULL) AS ledger
         FROM crew_xp x WHERE x.crew_id = $1`,
      [world.crewId],
    );
    // The crew's total is its ledger: the quest's XP and each first visit's.
    expect(Number(crew?.xp)).toBe(Number(crew?.ledger));
    expect(Number(crew?.xp)).toBeGreaterThanOrEqual(xp + 3 * 10);
  });
});
