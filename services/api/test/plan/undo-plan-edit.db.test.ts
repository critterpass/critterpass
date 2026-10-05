/**
 * `undo_plan_edit` on the real stack: an organiser takes back their own edit and the plan reads as
 * it did before (a removed stop returns with its lock and its translations); a member, somebody
 * else's edit and an edit the plan has moved on from are all refused, and nothing changes.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7, guideTextSourceHash } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPlanCommands } from '../../src/commands/plan';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
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

const itemsOf = async (versionId: string) => {
  const { rows } = await harness.pool.query<{
    stable_id: string;
    day_no: number;
    starts_at: Date;
    locked_reason: string | null;
    i18n: unknown;
  }>(
    `SELECT i.stable_id, d.day_no, i.starts_at, i.locked_reason, i.i18n
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.version_id = $1 ORDER BY i.stable_id`,
    [versionId],
  );
  return rows;
};

const edit = (who: SignedIn, base: string, ops: unknown[], opId: string) =>
  harness.run(
    who,
    'apply_plan_ops',
    { trip_id: crew.tripId, base_version: base, ops, confirm_locked: true },
    { opId },
  );

const undo = (who: SignedIn, opId: string) =>
  harness.run(who, 'undo_plan_edit', { trip_id: crew.tripId, op_id: opId });

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('undo_plan_edit', () => {
  it('puts the plan back as it was before the organiser’s own edit', async () => {
    const base = await current();
    const i18n = {
      _src: guideTextSourceHash('plan_item', { notes: 'Go early.' }),
      vi: { notes: 'Đi sớm.' },
    };
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `UPDATE plan_items SET notes = 'Go early.', locked_reason = 'must_do', i18n = $3
          WHERE version_id = $1 AND stable_id = $2`,
        [base, plan.museum, i18n],
      ),
    );
    const before = await itemsOf(base);
    const opId = generateUuidV7();
    const applied = await edit(
      crew.organiser,
      base,
      [
        { op: 'remove', item: plan.museum },
        {
          op: 'move',
          item: plan.walk,
          new: {
            day_no: 3,
            starts_at: tokyo(plan.dates[2] as string, 15),
            ends_at: tokyo(plan.dates[2] as string, 17),
          },
        },
      ],
      opId,
    );
    expect(applied.status).toBe(200);
    const edited = resultOf<{ version_id: string }>(applied).version_id;
    expect(await itemsOf(edited)).toHaveLength(2);

    const undone = await undo(crew.organiser, opId);
    expect(undone.status).toBe(200);
    const restored = resultOf<{ version_id: string }>(undone).version_id;
    expect(await current()).toBe(restored);
    expect(restored).not.toBe(base);
    expect(await itemsOf(restored)).toEqual(before);
    const { rows } = await harness.pool.query<{ status: string; parent_id: string }>(
      'SELECT status, parent_id FROM itinerary_versions WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[edited, restored]],
    );
    expect(rows).toEqual([
      { status: 'superseded', parent_id: base },
      { status: 'current', parent_id: edited },
    ]);

    // The undo is itself the newest version now: the same edit can't be taken back twice.
    expect(errorOf(await undo(crew.organiser, opId))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'plan_moved_on' },
    });
  });

  it('refuses a member, somebody else’s edit and an edit the plan has moved on from', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    const base = await current();
    const move = (hour: number) => [
      {
        op: 'move',
        item: plan.walk,
        new: {
          starts_at: tokyo(plan.dates[0] as string, hour),
          ends_at: tokyo(plan.dates[0] as string, hour + 2),
        },
      },
    ];
    const first = generateUuidV7();
    const one = await edit(crew.organiser, base, move(10), first);
    expect(one.status).toBe(200);
    const afterOne = resultOf<{ version_id: string }>(one).version_id;

    expect(errorOf(await undo(member, first))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'use_changeset' },
    });
    expect(errorOf(await undo(crew.organiser, generateUuidV7()))).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'edit' },
    });

    const second = generateUuidV7();
    expect((await edit(crew.organiser, afterOne, move(11), second)).status).toBe(200);
    const afterTwo = await current();
    expect(errorOf(await undo(crew.organiser, first))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'plan_moved_on' },
    });
    expect(await current()).toBe(afterTwo);
  });
});
