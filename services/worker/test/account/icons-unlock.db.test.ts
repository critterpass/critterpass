/**
 * Earned app icons against a real database: a verified find of a named form opens its icon once,
 * unseen (the picker's NEW badge), for its finder only; an unverified find opens nothing; and the
 * fan-out of a find reaches the handler.
 */
import { withSystem } from '@cp/db';
import type { AppIconFormUnlock } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { registerAppIconUnlocks, unlockEarnedIcons } from '../../src/jobs/app-icons/unlock';
import { fanOutReward, resetRewardHandlersForTests } from '../../src/jobs/rewards';
import { startCritterWorld, type CritterWorld } from '../critters/critters-world';

let world: CritterWorld;
const T0 = new Date('2026-06-01T03:00:00Z');

// The test world's catalogue: a named form, and a critter whose every form counts.
const RULES: readonly AppIconFormUnlock[] = [
  { icon: 'temple', formKey: 'cp-802:rare' },
  { icon: 'sardi', critterKey: 'cp-803' },
];

beforeAll(async () => {
  world = await startCritterWorld(2);
}, 240_000);

afterEach(() => resetRewardHandlersForTests());

afterAll(async () => {
  await world.stop();
});

async function find(
  uid: string,
  rarity: 'common' | 'rare' | 'epic',
  verification: 'verified' | 'pending',
): Promise<string> {
  const no = { common: 801, rare: 802, epic: 803 }[rarity];
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
       verification)
     VALUES ($1, $2, $3, $4, $5, 'encounter', $6) RETURNING id`,
    [uid, world.ids[`form_${rarity}`], world.ids[`critter_${no}`], T0, world.tripId, verification],
  );
  return row?.id as string;
}

const unlocks = (uid: string) =>
  world.q<{ icon_key: string; source: string; seen: boolean }>(
    `SELECT icon_key, source, seen_at IS NOT NULL AS seen FROM app_icon_unlocks
      WHERE user_id = $1 ORDER BY icon_key`,
    [uid],
  );

describe('earned app icons', () => {
  it('opens the icon of a verified find once, unseen, for its finder only', async () => {
    const [maya, dev] = world.members as [string, string];
    await find(maya, 'rare', 'verified');
    await find(maya, 'common', 'verified');
    await find(dev, 'epic', 'pending');

    const run = () =>
      withSystem(world.harness.pool, (tx) => unlockEarnedIcons(tx, [maya, dev], T0, RULES));
    expect(await run()).toEqual([{ userId: maya, icon: 'temple' }]);
    expect(await run()).toEqual([]);

    expect(await unlocks(maya)).toEqual([
      { icon_key: 'temple', source: 'form_found', seen: false },
    ]);
    expect(await unlocks(dev)).toEqual([]);
  });

  it('opens a critter icon for any of its forms once the find is verified', async () => {
    const [, dev] = world.members as [string, string];
    await world.q("UPDATE collection_entries SET verification = 'verified' WHERE user_id = $1", [
      dev,
    ]);
    const opened = await withSystem(world.harness.pool, (tx) =>
      unlockEarnedIcons(tx, [dev], T0, RULES),
    );
    expect(opened).toEqual([{ userId: dev, icon: 'sardi' }]);
  });

  it('runs on the fan-out of a find', async () => {
    registerAppIconUnlocks();
    const [maya] = world.members as [string];
    const entry = await find(maya, 'epic', 'verified');
    // The shipped rules name the real catalogue, which this world does not hold: the handler
    // runs and opens nothing, and the fan-out still announces the find.
    expect(
      await fanOutReward(world.harness.pool, {
        kind: 'critter_found',
        entry_ids: [entry],
        granted_at: T0.toISOString(),
      }),
    ).toEqual({ announced: 1 });
    expect((await unlocks(maya)).map((row) => row.icon_key)).toEqual(['temple']);
  });
});
