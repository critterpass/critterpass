/**
 * `copresence.evaluate` against a migrated Postgres: six travellers whose verified dwells at the
 * Marble Mountains overlap are all granted the legendary with one identical `found_at`; with one
 * of six missing nobody is; `trip_copresence` carries counts and who is missing, never a place.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateCopresence, largestOverlap } from '../../src/jobs/critters/copresence';
import { verifyEncounter } from '../../src/jobs/critters/verify';
import { startCritterWorld, type CritterWorld } from './critters-world';

let world: CritterWorld;
const T0 = new Date('2026-10-03T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

beforeAll(async () => {
  world = await startCritterWorld(6);
  await world.q(
    `INSERT INTO eggs (user_id, trip_id, form_id, hatched_at, trigger)
     SELECT p.user_id, p.trip_id, $2, now(), 'landed' FROM trip_participants p WHERE p.trip_id = $1`,
    [world.tripId, world.ids['form_common']],
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

async function progress() {
  const rows = await world.q<{ type: string; data: Record<string, unknown> }>(
    `SELECT payload->>'type' AS type, payload->'data' AS data FROM rt_outbox
      WHERE channel = 'trip_copresence:' || $1 ORDER BY id`,
    [world.tripId],
  );
  return rows;
}

const job = () => ({ trip_id: world.tripId, spawn_rule_id: world.ids['ruleMarble'] as string });

describe('largestOverlap', () => {
  it('needs the whole overlap from one shared instant', () => {
    const dwell = (user_id: string, from: number, to: number) => ({
      user_id,
      encounter_id: user_id,
      from_ms: from * 1000,
      to_ms: to * 1000,
    });
    const group = largestOverlap(
      [dwell('a', 0, 320), dwell('b', 250, 600), dwell('c', 280, 330)],
      60_000,
    );
    expect(group.map((d) => d.user_id).sort()).toEqual(['a', 'b']);
  });
});

describe('copresence.evaluate', () => {
  it('grants nobody while one of six is missing, and says who', async () => {
    const [, ...five] = world.members;
    for (const [i, uid] of five.entries()) {
      const id = await world.befriended({ uid, rule: 'marble', at: at(10 + i) });
      expect((await verifyEncounter(world.harness.pool, id, at(10 + i))).outcome).toBe('verified');
    }
    expect(await evaluateCopresence(world.harness.pool, job(), at(20))).toEqual({
      here: 5,
      needed: 6,
      granted: 0,
    });
    const [latest] = (await progress()).slice(-1);
    expect(latest).toEqual({
      type: 'copresence.progress',
      data: { rule_id: job().spawn_rule_id, here: 5, needed: 6, missing: [world.members[0]] },
    });
    expect(
      await world.q('SELECT 1 FROM collection_entries WHERE form_id = $1', [
        world.ids['form_legendary'],
      ]),
    ).toEqual([]);
  });

  it('grants all six with one identical found_at once the last arrives', async () => {
    const [first] = world.members as [string];
    const id = await world.befriended({ uid: first, rule: 'marble', at: at(12) });
    await verifyEncounter(world.harness.pool, id, at(12));
    const result = await evaluateCopresence(world.harness.pool, job(), at(21));
    expect(result).toEqual({ here: 6, needed: 6, granted: 6 });
    const entries = await world.q<{ found_at: Date; verification: string }>(
      'SELECT found_at, verification FROM collection_entries WHERE form_id = $1',
      [world.ids['form_legendary']],
    );
    expect(entries).toHaveLength(6);
    expect(new Set(entries.map((e) => e.found_at.toISOString()))).toEqual(
      new Set([at(21).toISOString()]),
    );
    expect(entries.every((e) => e.verification === 'verified')).toBe(true);
    const fanouts = await world.jobs('reward.fanout');
    expect(fanouts.at(-1)).toMatchObject({ granted_at: at(21).toISOString() });
    expect((fanouts.at(-1)?.['entry_ids'] as string[]).length).toBe(6);
    const payloads = JSON.stringify(await progress());
    expect(payloads).not.toMatch(/lat|lng|poi/);
    expect((await evaluateCopresence(world.harness.pool, job(), at(22))).granted).toBe(0);
  });
});
