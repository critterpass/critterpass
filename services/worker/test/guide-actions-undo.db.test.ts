/**
 * Undoing guide actions through `app.undo_guide_action`: the inverse restores the plan item's exact
 * prior values as a new version with a compensating action; repeats return the first undo; only an
 * affected member or an organiser may undo; a later edit to the item blocks the undo; and the
 * window closes on its timer (`guide_action.undo_expire`, fired by `sched.enqueue_due`).
 */
import { withSystem, withUser } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  guideActionExecuteJob,
  guideActionUndoExpireJob,
  planGuideAction,
  undoGuideAction,
  type ExecuteOptions,
} from '../src/guide-actions';
import { enqueueDue } from '../src/jobs/sched/enqueue-due';
import { silent, startJobsHarness, until, type JobsHarness } from './helpers/jobs-harness';
import { buildGuidePlan, itemBytes, type GuidePlanFixture } from './guide-actions/plan-fixture';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness.close();
});

async function runtime(options: ExecuteOptions = {}) {
  return harness.startRuntime([
    { ...guideActionExecuteJob(options), pollingIntervalSeconds: 0.5 },
    { ...guideActionUndoExpireJob(), pollingIntervalSeconds: 0.5 },
  ]);
}

async function status(id: string): Promise<string> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM guide_actions WHERE id = $1',
    [id],
  );
  return rows[0]?.status ?? 'missing';
}

/** Rin's pickup moved by `minutes`, auto-applied; resolves once it is done. */
async function movePickup(fx: GuidePlanFixture, minutes: number): Promise<string> {
  const startsAt = new Date(fx.pickup.startsAt.getTime() + minutes * 60_000).toISOString();
  const { actionId } = await withSystem(harness.pool, (tx) =>
    planGuideAction(tx, {
      tripId: fx.tripId,
      kind: 'reschedule_pickup',
      ops: [
        {
          op: 'retime',
          target: fx.pickup.stableId,
          after: { starts_at: startsAt, notes: `Gate B, +${minutes} min` },
          reason: 'flight delayed',
          affected_user_ids: [fx.rinId],
          booking_impact: false,
        },
      ],
      guideId: fx.guideId,
      requesterId: fx.rinId,
    }),
  );
  await until(async () => (await status(actionId)) === 'done', 15_000);
  return actionId;
}

const undoAs = (uid: string, actionId: string) =>
  withUser(harness.pool, uid, 'unknown', (tx) => undoGuideAction(tx, actionId, uid));

describe('undo_guide_action', () => {
  it('restores the prior plan item exactly and answers repeats with the first undo', async () => {
    await runtime();
    const fx = await buildGuidePlan(harness.pool);
    const original = await itemBytes(harness.pool, fx.tripId, fx.pickup.stableId);
    const actionId = await movePickup(fx, 40);
    expect(await itemBytes(harness.pool, fx.tripId, fx.pickup.stableId)).not.toEqual(original);

    const undone = await undoAs(fx.rinId, actionId);
    expect(undone).toMatchObject({ action_id: actionId, already_undone: false });
    expect(await itemBytes(harness.pool, fx.tripId, fx.pickup.stableId)).toEqual(original);
    expect(await status(actionId)).toBe('undone');

    const { rows } = await harness.pool.query(
      `SELECT ga.status, ga.compensates_id, ga.reversible, cs.author_kind, cs.approved_by_kind,
              cs.status AS cs_status,
              (SELECT status FROM change_sets WHERE id = orig.change_set_id) AS original_cs
         FROM guide_actions ga JOIN change_sets cs ON cs.id = ga.change_set_id
         JOIN guide_actions orig ON orig.id = ga.compensates_id
        WHERE ga.id = $1`,
      [undone.undo_action_id],
    );
    expect(rows).toEqual([
      {
        status: 'done',
        compensates_id: actionId,
        reversible: false,
        author_kind: 'user',
        approved_by_kind: 'self',
        cs_status: 'applied',
        original_cs: 'reverted',
      },
    ]);
    const { rows: timers } = await harness.pool.query(
      "SELECT status FROM scheduled_events WHERE kind = 'guide_action.undo_expire' AND ref_id = $1",
      [actionId],
    );
    expect(timers).toEqual([{ status: 'cancelled' }]);

    const again = await undoAs(fx.organiserId, actionId);
    expect(again).toMatchObject({
      undo_action_id: undone.undo_action_id,
      change_set_id: undone.change_set_id,
      already_undone: true,
    });
    expect(await itemBytes(harness.pool, fx.tripId, fx.pickup.stableId)).toEqual(original);
  });

  it('lets only an affected member or an organiser undo', async () => {
    await runtime();
    const fx = await buildGuidePlan(harness.pool);
    const actionId = await movePickup(fx, 20);
    await expect(undoAs(fx.mayaId, actionId)).rejects.toMatchObject({
      code: '42501',
      hint: 'not_affected',
    });
    await expect(undoAs(fx.outsiderId, actionId)).rejects.toMatchObject({ code: 'P0002' });
    await expect(
      withUser(harness.pool, fx.rinId, 'unknown', (tx) => undoGuideAction(tx, actionId, fx.mayaId)),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(undoAs(fx.organiserId, actionId)).resolves.toMatchObject({
      already_undone: false,
    });
  });

  it('refuses an undo that would overwrite a later change to the same item', async () => {
    await runtime();
    const fx = await buildGuidePlan(harness.pool);
    const first = await movePickup(fx, 20);
    await movePickup(fx, 50);
    await expect(undoAs(fx.rinId, first)).rejects.toMatchObject({
      code: '40001',
      hint: 'plan_changed',
    });
    expect(await status(first)).toBe('done');
  });

  it('closes the undo window on its timer, and refuses undo from then on', async () => {
    const boss = await runtime({ undoWindowMs: 1500 });
    const fx = await buildGuidePlan(harness.pool);
    const actionId = await movePickup(fx, 30);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(await enqueueDue(harness.pool, boss, silent)).toMatchObject({ fired: 1 });
    await until(async () => {
      const { rows } = await harness.pool.query<{ closed: boolean }>(
        "SELECT audit ? 'undo_closed_at' AS closed FROM guide_actions WHERE id = $1",
        [actionId],
      );
      return rows[0]?.closed === true;
    }, 15_000);
    const { rows: hints } = await harness.pool.query(
      `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'guide.undo_closed'`,
      [`trip_plan:${fx.tripId}`],
    );
    expect(hints).toHaveLength(1);
    await expect(undoAs(fx.rinId, actionId)).rejects.toMatchObject({
      code: '55000',
      hint: 'undo_window_closed',
    });
  });

  it('never makes a removal undoable, so it always waits for a yes', async () => {
    await runtime();
    const fx = await buildGuidePlan(harness.pool);
    const { actionId, reversible } = await withSystem(harness.pool, (tx) =>
      planGuideAction(tx, {
        tripId: fx.tripId,
        kind: 'remove_item',
        ops: [
          {
            op: 'remove',
            target: fx.pickup.stableId,
            reason: 'Rin is taking the shuttle',
            affected_user_ids: [fx.rinId],
            booking_impact: false,
          },
        ],
        guideId: fx.guideId,
        requesterId: fx.rinId,
      }),
    );
    expect(reversible).toBe(false);
    await until(async () => (await status(actionId)) === 'needs_approval', 15_000);
  });
});
