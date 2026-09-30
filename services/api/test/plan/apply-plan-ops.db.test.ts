/**
 * `apply_plan_ops` on the real stack: a member is told to propose instead; an organiser's move
 * lands as a new current version the crew hears about; a booked item needs the confirmation and a
 * booked day never moves; and two edits racing on one base version end with exactly one version
 * and one `PLAN_VERSION_CONFLICT` naming it.
 */
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

const moveWalk = (who: SignedIn, base: string, hour: number, extra: Record<string, unknown> = {}) =>
  harness.run(who, 'apply_plan_ops', {
    trip_id: crew.tripId,
    base_version: base,
    ops: [
      {
        op: 'move',
        item: plan.walk,
        new: {
          starts_at: tokyo(plan.dates[0] as string, hour),
          ends_at: tokyo(plan.dates[0] as string, hour + 1),
        },
      },
    ],
    ...extra,
  });

beforeAll(async () => {
  harness = await startSetupHarness(registerPlanCommands);
  crew = await buildSetupCrew(harness, 2);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('apply_plan_ops', () => {
  it('sends a member to a change set and commits an organiser edit as a new version', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    expect(errorOf(await moveWalk(member, plan.versionId, 11))).toMatchObject({
      code: 'FORBIDDEN',
      detail: { reason: 'use_changeset' },
    });

    const applied = await moveWalk(crew.organiser, plan.versionId, 11);
    expect(applied.status).toBe(200);
    const { version_id: versionId } = resultOf<{ version_id: string }>(applied);
    expect(await current()).toBe(versionId);
    const { rows } = await harness.pool.query<{ status: string; starts: Date; items: number }>(
      `SELECT (SELECT status FROM itinerary_versions WHERE id = $1) AS status,
              (SELECT starts_at FROM plan_items WHERE version_id = $2 AND stable_id = $3) AS starts,
              (SELECT count(*)::int FROM plan_items WHERE version_id = $2) AS items`,
      [plan.versionId, versionId, plan.walk],
    );
    expect(rows[0]).toMatchObject({ status: 'superseded', items: 3 });
    expect(rows[0]?.starts.toISOString()).toBe(tokyo(plan.dates[0] as string, 11));
    const hints = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`trip_plan:${crew.tripId}`],
    );
    expect(hints.rows.map((r) => r.type)).toContain('plan.ops');
    const jobs = await harness.pool.query<{ name: string }>(
      "SELECT DISTINCT name FROM pgboss.job WHERE name IN ('plan.stale_sweep', 'cost.recompute')",
    );
    expect(jobs.rows.map((r) => r.name).sort()).toEqual(['cost.recompute', 'plan.stale_sweep']);

    expect(errorOf(await moveWalk(crew.organiser, plan.versionId, 12))).toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
      detail: { latest: versionId },
    });
  });

  it('asks before moving a booked item and never moves a booked day', async () => {
    const base = await current();
    const moveDinner = (confirm: boolean) =>
      harness.run(crew.organiser, 'apply_plan_ops', {
        trip_id: crew.tripId,
        base_version: base,
        ops: [{ op: 'move', item: plan.dinner, new: { day_no: 2 } }],
        confirm_locked: confirm,
      });
    expect(errorOf(await moveDinner(false))).toMatchObject({
      code: 'STATE_INVALID',
      detail: {
        reason: 'locked_item',
        items: [{ stable_id: plan.dinner, locked_reason: 'booking' }],
      },
    });
    const reorder = await harness.run(crew.organiser, 'apply_plan_ops', {
      trip_id: crew.tripId,
      base_version: base,
      ops: [{ op: 'reorder_days', new: { order: [2, 1, 3] } }],
      confirm_locked: true,
    });
    expect(errorOf(reorder)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'booked_day_fixed', day_no: 1 },
    });
    expect((await moveDinner(true)).status).toBe(200);
  });

  it('lets exactly one of two racing edits on the same base through', async () => {
    const base = await current();
    const answers = await Promise.all([
      moveWalk(crew.organiser, base, 13),
      moveWalk(crew.organiser, base, 14),
    ]);
    const ok = answers.filter((a) => a.status === 200);
    const conflicts = answers.filter((a) => errorOf(a).code === 'PLAN_VERSION_CONFLICT');
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const winner = resultOf<{ version_id: string }>(ok[0] as { body: Record<string, unknown> });
    expect(errorOf(conflicts[0] as { body: Record<string, unknown> }).detail).toEqual({
      latest: winner.version_id,
    });
    expect(await current()).toBe(winner.version_id);
  });
});
