/**
 * XP sources against a migrated Postgres: settling up pays the settle XP once to the crew and each
 * member, and never grants a second Settled Tokek; a verified find pays its form XP through the
 * rewards fan-out; a first visit to a place pays the visit XP once; crossing a level grants that
 * crew exactly one level sticker, however often the grant is retried.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { crewLevel } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateEvent } from '../../src/jobs/quests/evaluate';
import { grantXp } from '../../src/jobs/rewards/handlers/xp';
import { fanOutReward } from '../../src/jobs/rewards';
import { PLACES, startQuestWorld, type QuestWorld } from './quests-world';

let world: QuestWorld;

beforeAll(async () => {
  world = await startQuestWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

const ledger = (kind: string, source: string) =>
  world.q<{ user_id: string | null; amount: number }>(
    'SELECT user_id, amount FROM xp_ledger WHERE source_kind = $1 AND source_id = $2 ORDER BY user_id',
    [kind, source],
  );

const crewTotal = async () =>
  (
    await world.q<{ xp: string; level: number }>(
      'SELECT xp, level FROM crew_xp WHERE crew_id = $1',
      [world.crewId],
    )
  )[0];

describe('XP sources', () => {
  it('pays the settle XP once and grants no second Settled Tokek', async () => {
    const at = new Date();
    for (const uid of world.members) {
      await world.q(
        `INSERT INTO stickers (user_id, crew_id, trip_id, kind, granted_at)
         VALUES ($1, $2, $3, 'settled', $4)`,
        [uid, world.crewId, world.tripId, at],
      );
    }
    const settled = await world.event('trip.settled', {
      crew_id: world.crewId,
      trip_id: world.tripId,
      granted_at: at.toISOString(),
      user_ids: world.members,
    });
    expect((await evaluateEvent(world.harness.pool, settled)).xp).toBe(true);
    expect((await evaluateEvent(world.harness.pool, settled)).xp).toBe(false);
    const rows = await ledger('settle', world.tripId);
    expect(rows).toHaveLength(world.members.length + 1);
    expect(rows.every((row) => row.amount === 150)).toBe(true);
    const stickers = await world.q(
      "SELECT 1 FROM stickers WHERE trip_id = $1 AND kind = 'settled'",
      [world.tripId],
    );
    expect(stickers).toHaveLength(world.members.length);
  });

  it('pays a verified find its form XP through the rewards fan-out, once', async () => {
    const [a] = world.members as [string];
    const [entry] = await world.q<{ id: string }>(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source, verification)
       VALUES ($1, $2, $3, now(), $4, 'encounter', 'verified') RETURNING id`,
      [a, world.ids['form_common'], world.ids['critter_801'], world.tripId],
    );
    const job = {
      kind: 'critter_found' as const,
      entry_ids: [entry?.id as string],
      granted_at: new Date().toISOString(),
    };
    await fanOutReward(world.harness.pool, job);
    await fanOutReward(world.harness.pool, job);
    expect(await ledger('form', entry?.id as string)).toEqual([
      { user_id: a, amount: 25 },
      { user_id: null, amount: 25 },
    ]);
  });

  it('pays a first visit to a place once per traveller and trip', async () => {
    const [, b] = world.members as [string, string];
    const first = await world.visit(b, PLACES.bana, world.at('08:00'));
    const again = await world.visit(b, PLACES.bana, world.at('10:00'));
    for (const visit of [first, again]) {
      await evaluateEvent(
        world.harness.pool,
        await world.event('visit.recorded', {
          visit_id: visit,
          trip_id: world.tripId,
          source: 'manual',
        }),
      );
    }
    expect(await ledger('visit', first)).toHaveLength(2);
    expect(await ledger('visit', again)).toHaveLength(0);
  });

  it('grants one level sticker per crew per level, however often a grant is retried', async () => {
    const before = await crewTotal();
    const source = randomUUID();
    const grant = {
      crewId: world.crewId,
      tripId: world.tripId,
      userIds: [],
      amount: 2000,
      sourceKind: 'quest' as const,
      sourceId: source,
      at: new Date(),
    };
    const results = await Promise.all(
      [0, 1, 2].map(() => withSystem(world.harness.pool, (tx) => grantXp(tx, grant))),
    );
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    const after = await crewTotal();
    expect(Number(after?.xp)).toBe(Number(before?.xp ?? 0) + 2000);
    expect(after?.level).toBe(crewLevel(Number(after?.xp)).level);
    const levels = await world.q<{ level: number }>(
      "SELECT level FROM stickers WHERE crew_id = $1 AND kind = 'crew_level' ORDER BY level",
      [world.crewId],
    );
    const expected = [];
    for (let level = 2; level <= (after?.level ?? 1); level += 2) expected.push(level);
    expect(levels.map((row) => row.level)).toEqual(expected);
    const events = (
      await world.harness.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM domain_events WHERE type = 'sticker.granted' AND crew_id = $1",
        [world.crewId],
      )
    ).rows;
    expect(events[0]?.n).toBe(expected.length);
  });
});
