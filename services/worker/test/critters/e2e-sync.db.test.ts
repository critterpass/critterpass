/**
 * The server half of an offline find, from the rows the api writes for an offline batch (an
 * encounter started offline, its samples, the befriend's evidence and pending entry; the api half
 * is services/api/test/critters/commands.db.test.ts) through `critter.verify`: a find befriended
 * with no signal and uploaded hours later verifies and gets its names, announced once; a replay
 * of the verification changes nothing; an upload days late still verifies, flagged for review.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { verifyEncounter } from '../../src/jobs/critters/verify';
import { resetRewardHandlersForTests } from '../../src/jobs/rewards';
import { startCritterWorld, type CritterWorld } from './critters-world';

let world: CritterWorld;
const T0 = new Date('2026-10-03T03:00:00Z');
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

beforeAll(async () => {
  world = await startCritterWorld(3);
}, 240_000);

afterEach(() => resetRewardHandlersForTests());

afterAll(async () => {
  await world?.stop();
});

/** What an offline batch leaves behind once it reaches the api `uploadedAfterH` hours later. */
async function offlineFind(uid: string, uploadedAfterH: number): Promise<string> {
  const id = await world.befriended({ uid, rule: 'bridge', at: T0 });
  await world.q('UPDATE encounters SET offline = true WHERE id = $1', [id]);
  for (let i = 0; i < 3; i += 1) {
    await world.q(
      `INSERT INTO encounter_samples (encounter_id, user_id, at, distance_band, accuracy_m, speed_mps)
       VALUES ($1, $2, $3::timestamptz - make_interval(secs => $4::int), '10_25', 9, 0.5)`,
      [id, uid, T0, 300 - i * 60],
    );
  }
  await world.q('UPDATE encounter_evidence SET received_at = $2 WHERE encounter_id = $1', [
    id,
    hours(uploadedAfterH),
  ]);
  return id;
}

async function entry(encounterId: string) {
  return world.q<{ verification: string; critter_name: string | null }>(
    'SELECT verification, critter_name FROM collection_entries WHERE encounter_id = $1',
    [encounterId],
  );
}

describe('an offline find, uploaded later', () => {
  it('verifies, gets its names and is announced once; a replay changes nothing', async () => {
    const [maya] = world.members as [string];
    const id = await offlineFind(maya, 6);
    expect(await entry(id)).toEqual([{ verification: 'pending', critter_name: null }]);

    const result = await verifyEncounter(world.harness.pool, id, hours(6));
    expect(result.outcome).toBe('verified');
    expect(result.score?.hard ?? []).toEqual([]);
    expect(result.score?.soft ?? []).not.toContain('late_upload');
    const [named] = await entry(id);
    expect(named?.verification).toBe('verified');
    expect(named?.critter_name).not.toBeNull();
    const encounter = await world.q<{ offline: boolean; verification: string }>(
      'SELECT offline, verification FROM encounters WHERE id = $1',
      [id],
    );
    expect(encounter).toEqual([{ offline: true, verification: 'verified' }]);
    const announced = (await world.jobs('reward.fanout')).length;
    expect(announced).toBeGreaterThan(0);

    expect(await verifyEncounter(world.harness.pool, id, hours(7))).toEqual({
      outcome: 'skipped',
    });
    expect(await world.jobs('reward.fanout')).toHaveLength(announced);
    expect(await entry(id)).toEqual([named]);
  });

  it('still verifies an upload days late, flagged for review rather than revoked', async () => {
    const [, rin] = world.members as [string, string];
    const id = await offlineFind(rin, 96);
    const result = await verifyEncounter(world.harness.pool, id, hours(96));
    expect(result.outcome).toBe('verified');
    expect(result.score?.soft).toContain('late_upload');
    expect((await entry(id))[0]?.verification).toBe('verified');
  });
});
