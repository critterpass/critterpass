/**
 * Pushes on the real stack: an organiser's add that pushes a later stop is recorded on the new
 * version with the stop's time before and after; the record survives an edit elsewhere and ends
 * when the pushed stop is moved by hand.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../src/commands/plan';
import {
  buildSetupCrew,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../setup/setup-harness';
import { seedCurrentPlan, tokyo, type SeededPlan } from './plan-fixture';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;

const current = async (): Promise<string> => {
  const { rows } = await harness.pool.query<{ v: string }>(
    'SELECT current_version_id AS v FROM trips WHERE id = $1',
    [crew.tripId],
  );
  return rows[0]?.v as string;
};

const pushesOf = async (versionId: string) => {
  const { rows } = await harness.pool.query<{ pushes: unknown }>(
    'SELECT pushes FROM itinerary_versions WHERE id = $1',
    [versionId],
  );
  return rows[0]?.pushes ?? null;
};

const apply = (base: string, ops: unknown[], pushed?: unknown) =>
  harness.run(crew.organiser, 'apply_plan_ops', {
    trip_id: crew.tripId,
    base_version: base,
    ops,
    ...(pushed === undefined ? {} : { pushed }),
  });

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 1);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('pushes', () => {
  it('records what an add pushed, keeps it through other edits, and ends it on a hand edit', async () => {
    const date = plan.dates[0] as string;
    const spa = generateUuidV7();
    const added = await apply(
      plan.versionId,
      [
        {
          op: 'add',
          item: spa,
          new: { day_no: 1, starts_at: tokyo(date, 9), ends_at: tokyo(date, 10), tz: 'Asia/Tokyo' },
        },
        {
          op: 'move',
          item: plan.walk,
          new: { starts_at: tokyo(date, 10), ends_at: tokyo(date, 12) },
        },
      ],
      {
        cause: spa,
        items: [
          { stable_id: plan.walk, from: { starts_at: tokyo(date, 9), ends_at: tokyo(date, 11) } },
        ],
      },
    );
    expect(added.status).toBe(200);
    const v1 = resultOf<{ version_id: string }>(added).version_id;
    const [record] = (await pushesOf(v1)) as {
      cause: string;
      items: { stable_id: string; to: { starts_at: string } }[];
    }[];
    expect(record?.cause).toBe(spa);
    expect(record?.items.map((item) => item.stable_id)).toEqual([plan.walk]);
    expect(Date.parse(record?.items[0]?.to.starts_at ?? '')).toBe(Date.parse(tokyo(date, 10)));

    // An edit on another day leaves it in place.
    const elsewhere = await apply(v1, [
      {
        op: 'move',
        item: plan.museum,
        new: {
          starts_at: tokyo(plan.dates[1] as string, 13),
          ends_at: tokyo(plan.dates[1] as string, 15),
        },
      },
    ]);
    expect(elsewhere.status).toBe(200);
    expect(await pushesOf(await current())).toEqual(await pushesOf(v1));

    // Moving the pushed stop by hand ends it.
    const byHand = await apply(await current(), [
      {
        op: 'move',
        item: plan.walk,
        new: { starts_at: tokyo(date, 14), ends_at: tokyo(date, 16) },
      },
    ]);
    expect(byHand.status).toBe(200);
    expect(await pushesOf(await current())).toBe(null);
  });
});
