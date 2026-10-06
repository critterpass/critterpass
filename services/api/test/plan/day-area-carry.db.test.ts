/**
 * A day's area rides along with every edit that makes a new version: an organiser's move, a
 * reorder of the days, and taking an edit back. A plan with no areas reads as it always did.
 */
import { generateUuidV7 } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../src/commands/plan';
import { loadPlanState } from '../../src/plan/versioning';
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
let areaId: string;

const areas = async (versionId: string): Promise<Array<string | null>> => {
  const { rows } = await harness.pool.query<{ destination_id: string | null }>(
    'SELECT destination_id FROM plan_days WHERE version_id = $1 ORDER BY day_no',
    [versionId],
  );
  return rows.map((row) => row.destination_id);
};

const edit = async (base: string, ops: unknown[], opId = generateUuidV7()): Promise<string> =>
  resultOf<{ version_id: string }>(
    await harness.run(
      crew.organiser,
      'apply_plan_ops',
      { trip_id: crew.tripId, base_version: base, ops, confirm_locked: true },
      { opId },
    ),
  ).version_id;

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe("a day's area across plan edits", () => {
  it('reads a plan with no areas with no area key on any day', async () => {
    const state = await withSystem(harness.pool, (tx) => loadPlanState(tx, plan.versionId));
    for (const day of state.days) expect(day).not.toHaveProperty('destination_id');
  });

  it('keeps the area through a move, moves it with its day, and keeps it on undo', async () => {
    areaId = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage)
         VALUES ('carry-area', 'Nikko', 'area') RETURNING id`,
      );
      await tx.query(
        'UPDATE plan_days SET destination_id = $1 WHERE version_id = $2 AND day_no = 2',
        [rows[0]!.id, plan.versionId],
      );
      return rows[0]!.id;
    });

    const moved = await edit(plan.versionId, [
      {
        op: 'move',
        item: plan.walk,
        new: {
          starts_at: tokyo(plan.dates[0] as string, 12),
          ends_at: tokyo(plan.dates[0] as string, 13),
        },
      },
    ]);
    expect(await areas(moved)).toEqual([null, areaId, null]);

    const opId = generateUuidV7();
    const reordered = await edit(moved, [{ op: 'reorder_days', new: { order: [1, 3, 2] } }], opId);
    // Day 1 holds a booking and stays put; days 2 and 3 swap, the area with its day.
    expect(await areas(reordered)).toEqual([null, null, areaId]);

    const undone = await harness.run(crew.organiser, 'undo_plan_edit', {
      trip_id: crew.tripId,
      op_id: opId,
    });
    expect(undone.status).toBe(200);
    const { rows } = await harness.pool.query<{ v: string }>(
      'SELECT current_version_id AS v FROM trips WHERE id = $1',
      [crew.tripId],
    );
    expect(await areas(rows[0]!.v)).toEqual([null, areaId, null]);
  });
});
