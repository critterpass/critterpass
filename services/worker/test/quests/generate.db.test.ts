/**
 * Daily quest generation against a migrated Postgres: the guide's recorded quests for a Da Nang day
 * publish through the validator with code-set counts, once per trip day; without the guide the day
 * still gets deterministic quests; the hourly sweep queues each trip day once its morning comes;
 * on the trip's first date nothing asks the crew to be somewhere before their flight lands.
 */
import { QUEST_QUEUES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateQuests } from '../../src/jobs/quests/generate';
import { sweepQuestDays } from '../../src/jobs/quests/sweep';
import { ITEMS, PLACES, startQuestWorld, type QuestWorld } from './quests-world';
import { recordedWriter } from './recorded-writer';

let world: QuestWorld;

beforeAll(async () => {
  world = await startQuestWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

interface QuestRow {
  template: string;
  target: number;
  source: string;
  reward: { xp: number; sticker: string | null; form_id: string | null };
  params: Record<string, unknown>;
}

const questsOn = (date: string) =>
  world.q<QuestRow>(
    `SELECT template, target, source, reward, params FROM quests
      WHERE trip_id = $1 AND local_date = $2 ORDER BY slot`,
    [world.tripId, date],
  );

describe('quests.generate', () => {
  it("publishes the guide's valid quests with counts set by code, once per trip day", async () => {
    // The recorded reply also proposes settling up, which this trip has nothing to settle for.
    const job = { trip_id: world.tripId, local_date: world.today };
    const now = world.at('04:00');
    const first = await generateQuests(world.harness.pool, job, {
      writer: recordedWriter('quests-01'),
      now,
    });
    expect(first).toMatchObject({ outcome: 'published', quests: 3, fromGuide: 3 });
    const quests = await questsOn(world.today);
    expect(quests.map((q) => q.template)).toEqual(['early_start', 'visit_any_of', 'copresence']);
    expect(quests.every((q) => q.source === 'guide')).toBe(true);
    const together = quests.find((q) => q.template === 'copresence');
    expect(together?.target).toBe(4);
    expect(together?.params['poi_id']).toBe(PLACES.mykhe);
    const progress = await world.q('SELECT 1 FROM quest_progress WHERE trip_id = $1', [
      world.tripId,
    ]);
    expect(progress).toHaveLength(3);
    const again = await generateQuests(world.harness.pool, job, {
      writer: recordedWriter('quests-01'),
      now,
    });
    expect(again.outcome).toBe('already_published');
    expect(await questsOn(world.today)).toHaveLength(3);
    const events = (
      await world.harness.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM domain_events WHERE type = 'quest.published' AND trip_id = $1",
        [world.tripId],
      )
    ).rows;
    expect(events[0]?.n).toBe(1);
  });

  it('gives a day without a plan or a guide deterministic quests', async () => {
    const tomorrow = new Date(Date.parse(`${world.today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const result = await generateQuests(
      world.harness.pool,
      { trip_id: world.tripId, local_date: tomorrow },
      { now: world.at('04:00') },
    );
    expect(result.outcome).toBe('published');
    const quests = await questsOn(tomorrow);
    expect(quests.length).toBeGreaterThanOrEqual(1);
    expect(quests.every((q) => q.source === 'fallback')).toBe(true);
    expect(quests.map((q) => q.template)).toContain('log_expenses');
  });

  it('skips a trip day that is not on the trip', async () => {
    const result = await generateQuests(world.harness.pool, {
      trip_id: world.tripId,
      local_date: '2020-01-01',
    });
    expect(result.outcome).toBe('not_travelling');
  });

  it('queues a trip day from its local morning, and only while it has no quests', async () => {
    const published = await sweepQuestDays(world.harness.pool, world.at('05:00'));
    expect(published.queued).toBe(0);
    await world.harness.pool.query('DELETE FROM quest_progress WHERE trip_id = $1', [world.tripId]);
    await world.harness.pool.query('DELETE FROM quests WHERE trip_id = $1', [world.tripId]);
    const night = await sweepQuestDays(world.harness.pool, world.at('03:00'));
    expect(night.queued).toBe(0);
    const morning = await sweepQuestDays(world.harness.pool, world.at('05:00'));
    expect(morning.queued).toBe(1);
    const queued = await world.jobs(QUEST_QUEUES.generate);
    expect(queued).toContainEqual({ trip_id: world.tripId, local_date: world.today });
  });

  it("leaves out stops and deadlines before the crew's flight lands on the first day", async () => {
    await world.harness.pool.query('DELETE FROM quest_progress WHERE trip_id = $1', [world.tripId]);
    await world.harness.pool.query('DELETE FROM quests WHERE trip_id = $1', [world.tripId]);
    await world.q('UPDATE trips SET start_date = $2 WHERE id = $1', [world.tripId, world.today]);
    const [booking] = await world.q<{ id: string }>(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
       VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
      [world.tripId, world.members[0], world.members],
    );
    await world.q(
      `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
         dep_airport, arr_airport, sched_dep_at, sched_arr_at)
       VALUES ($1, $2, $3, true, 'VN', '117', 'SGN', 'DAD', $4, $5)`,
      [booking?.id, world.tripId, world.members[0], world.at('10:30'), world.at('12:00')],
    );
    // The recorded guide proposes Ba Na Hills by 06:30 and a sweep of all three stops.
    const result = await generateQuests(
      world.harness.pool,
      { trip_id: world.tripId, local_date: world.today },
      { writer: recordedWriter('quests-01'), now: world.at('04:00') },
    );
    expect(result.outcome).toBe('published');
    const quests = await world.q<QuestRow & { ends_at: Date }>(
      `SELECT template, target, source, reward, params, ends_at FROM quests
        WHERE trip_id = $1 AND local_date = $2 ORDER BY slot`,
      [world.tripId, world.today],
    );
    expect(quests.length).toBeGreaterThanOrEqual(3);
    const named = JSON.stringify(quests.map((q) => q.params));
    expect(named).not.toContain(PLACES.bana);
    expect(named).not.toContain(ITEMS.bana);
    expect(quests.map((q) => q.template)).not.toContain('early_start');
    const landed = world.at('12:00').getTime();
    expect(quests.every((q) => q.ends_at.getTime() > landed)).toBe(true);
  });
});
