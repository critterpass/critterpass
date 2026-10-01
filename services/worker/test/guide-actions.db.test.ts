/**
 * Guide actions end to end on a real pg-boss runtime: the autonomy decision is applied through a
 * ChangeSet (auto with an audited policy approval, or a poll draft awaiting a yes), and the
 * database itself refuses to approve a guide-authored ChangeSet without a decider audit row or a
 * person deciding as themselves.
 */
import { withSystem, withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  applyApprovedGuideAction,
  executeGuideAction,
  guideActionExecuteJob,
  planGuideAction,
  type PlanGuideActionInput,
} from '../src/guide-actions';
import { startJobsHarness, until, type JobsHarness } from './helpers/jobs-harness';
import {
  buildGuidePlan,
  itemBytes,
  type GuidePlanFixture,
  type PlanItemRef,
} from './guide-actions/plan-fixture';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

function retime(item: PlanItemRef, affected: string[], minutes: number) {
  const startsAt = new Date(item.startsAt.getTime() + minutes * 60_000).toISOString();
  return [
    {
      op: 'retime',
      target: item.stableId,
      after: { starts_at: startsAt },
      reason: 'flight delayed',
      affected_user_ids: affected,
      booking_impact: false,
    },
  ];
}

function input(
  fx: GuidePlanFixture,
  overrides: Partial<PlanGuideActionInput>,
): PlanGuideActionInput {
  return {
    tripId: fx.tripId,
    kind: 'reschedule_pickup',
    ops: retime(fx.pickup, [fx.rinId], 40),
    guideId: fx.guideId,
    requesterId: fx.rinId,
    ...overrides,
  };
}

async function planned(fx: GuidePlanFixture, overrides: Partial<PlanGuideActionInput> = {}) {
  const action = await withSystem(harness.pool, (tx) => planGuideAction(tx, input(fx, overrides)));
  await until(async () => (await actionRow(action.actionId)).status !== 'planned', 15_000);
  return { ...action, row: await actionRow(action.actionId) };
}

interface ActionView {
  status: string;
  reversible: boolean;
  undo_until: Date | null;
  audit: { decider?: Record<string, unknown>; poll_draft?: Record<string, unknown> };
  cs_status: string;
  approved_by_kind: string | null;
}

async function actionRow(id: string): Promise<ActionView> {
  const { rows } = await harness.pool.query<ActionView>(
    `SELECT ga.status, ga.reversible, ga.undo_until, ga.audit, cs.status AS cs_status, cs.approved_by_kind
       FROM guide_actions ga JOIN change_sets cs ON cs.id = ga.change_set_id WHERE ga.id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`guide action ${id} not found`);
  return row;
}

const asUser = (uid: string, sql: string, values: unknown[]) =>
  withUser(harness.pool, uid, 'unknown', (tx) => tx.query(sql, values));

describe('guide action executor', () => {
  it("applies a free change to the requester's own item, audited and undoable until it starts", async () => {
    await harness.startRuntime([{ ...guideActionExecuteJob(), pollingIntervalSeconds: 0.5 }]);
    const fx = await buildGuidePlan(harness.pool, { inTrip: true });
    const { actionId, changeSetId, row } = await planned(fx);

    expect(row).toMatchObject({
      status: 'done',
      reversible: true,
      cs_status: 'applied',
      approved_by_kind: 'policy',
    });
    expect(row.audit.decider).toMatchObject({ outcome: 'auto' });
    expect(row.undo_until).toEqual(fx.pickup.startsAt);
    const moved = (await itemBytes(harness.pool, fx.tripId, fx.pickup.stableId)) as {
      starts_at: string;
      notes: string;
    };
    expect(new Date(moved.starts_at)).toEqual(new Date(fx.pickup.startsAt.getTime() + 40 * 60_000));
    expect(moved.notes).toBe('Gate B');
    const { rows: activity } = await harness.pool.query(
      'SELECT actor_kind, actor_id, verb FROM activity_events WHERE object_id = $1',
      [changeSetId],
    );
    expect(activity).toEqual([{ actor_kind: 'guide', actor_id: fx.guideId, verb: 'applied' }]);
    const { rows: hints } = await harness.pool.query(
      `SELECT payload->'data'->>'action_id' AS action_id FROM rt_outbox
        WHERE channel = $1 AND payload->>'type' = 'guide.touched'`,
      [`trip_plan:${fx.tripId}`],
    );
    expect(hints).toEqual([{ action_id: actionId }]);
    const { rows: timers } = await harness.pool.query(
      "SELECT due_at FROM scheduled_events WHERE kind = 'guide_action.undo_expire' AND ref_id = $1",
      [actionId],
    );
    expect(timers).toEqual([{ due_at: fx.pickup.startsAt }]);

    const replay = await withSystem(harness.pool, (tx) => executeGuideAction(tx, actionId));
    expect(replay).toEqual({ status: 'skipped', current: 'done' });
  });

  it("waits for the affected majority before touching other people's plans", async () => {
    await harness.startRuntime([{ ...guideActionExecuteJob(), pollingIntervalSeconds: 0.5 }]);
    const fx = await buildGuidePlan(harness.pool);
    const everyone = [fx.organiserId, fx.rinId, fx.mayaId];
    const before = await itemBytes(harness.pool, fx.tripId, fx.dinner.stableId);
    const { actionId, changeSetId, row } = await planned(fx, {
      kind: 'retime_item',
      ops: retime(fx.dinner, everyone, 90),
    });

    expect(row).toMatchObject({ status: 'needs_approval', cs_status: 'proposed' });
    expect(row.audit.poll_draft).toMatchObject({
      kind: 'changeset_approval',
      change_set_id: changeSetId,
      decider_policy: 'majority_of_affected',
      threshold: 2,
      tie_breaker: 'organiser',
    });
    expect(new Date(String(row.audit.poll_draft?.closes_at)) <= fx.dinner.startsAt).toBe(true);
    expect(await itemBytes(harness.pool, fx.tripId, fx.dinner.stableId)).toEqual(before);

    await asUser(
      fx.organiserId,
      "UPDATE change_sets SET status = 'approved', approved_by_kind = 'organiser', approved_by = $2 WHERE id = $1",
      [changeSetId, fx.organiserId],
    );
    const outcome = await withSystem(harness.pool, (tx) => applyApprovedGuideAction(tx, actionId));
    expect(outcome).toMatchObject({ status: 'done' });
    expect(await actionRow(actionId)).toMatchObject({ status: 'done', cs_status: 'applied' });
  });

  it('never runs a change that costs money, even on the requester alone', async () => {
    await harness.startRuntime([{ ...guideActionExecuteJob(), pollingIntervalSeconds: 0.5 }]);
    const fx = await buildGuidePlan(harness.pool);
    const { row } = await planned(fx, { costDeltaMinor: 150_000 });
    expect(row.status).toBe('needs_approval');
    expect(row.audit.decider).toMatchObject({
      reason: 'money',
      decider_policy: 'majority_of_affected',
    });
  });

  it('refuses to plan a forbidden action at all', async () => {
    await harness.startRuntime([{ ...guideActionExecuteJob(), pollingIntervalSeconds: 0.5 }]);
    const fx = await buildGuidePlan(harness.pool);
    const attempt = withSystem(harness.pool, (tx) =>
      planGuideAction(tx, input(fx, { kind: 'contact_vendor' })),
    );
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    const { rows } = await harness.pool.query('SELECT id FROM change_sets WHERE trip_id = $1', [
      fx.tripId,
    ]);
    expect(rows).toEqual([]);
  });
});

describe('guide-authored ChangeSet approval', () => {
  let fx: GuidePlanFixture;
  let changeSetId: string;
  let actionId: string;

  beforeAll(async () => {
    await harness.startRuntime([{ ...guideActionExecuteJob(), pollingIntervalSeconds: 0.5 }]);
    fx = await buildGuidePlan(harness.pool);
    ({ changeSetId, actionId } = await planned(fx, {
      kind: 'retime_item',
      ops: retime(fx.dinner, [fx.organiserId, fx.rinId, fx.mayaId], 60),
    }));
    await harness.stopAll();
  });

  const approve = (uid: string, kind: string | null, by: string | null) =>
    asUser(
      uid,
      "UPDATE change_sets SET status = 'approved', approved_by_kind = $2, approved_by = $3 WHERE id = $1",
      [changeSetId, kind, by],
    );

  it('rejects a person approving without a source, as a vote, or on behalf of someone else', async () => {
    await expect(approve(fx.organiserId, null, null)).rejects.toThrow(/recorded approval source/);
    await expect(approve(fx.organiserId, 'vote', fx.organiserId)).rejects.toThrow(/poll engine/);
    await expect(approve(fx.organiserId, 'organiser', fx.mayaId)).rejects.toThrow(/as themselves/);
    await expect(approve(fx.rinId, 'self', fx.rinId)).resolves.toMatchObject({ rowCount: 0 });
    await expect(approve(fx.organiserId, 'policy', null)).rejects.toThrow(/only app_system/);
    expect((await actionRow(actionId)).cs_status).toBe('proposed');
  });

  it('rejects a policy approval without the running action’s auto decider audit', async () => {
    const policy = (tx: Parameters<Parameters<typeof withSystem>[1]>[0]) =>
      tx.query(
        "UPDATE change_sets SET status = 'approved', approved_by_kind = 'policy' WHERE id = $1",
        [changeSetId],
      );
    await expect(withSystem(harness.pool, policy)).rejects.toThrow(/no autonomy decision/);
    // A forged `auto` on an action that is not the one executing (still awaiting approval).
    await expect(
      withSystem(harness.pool, async (tx) => {
        await tx.query(
          `UPDATE guide_actions SET audit = audit || '{"decider":{"outcome":"auto"}}'::jsonb WHERE id = $1`,
          [actionId],
        );
        await policy(tx);
      }),
    ).rejects.toThrow(/no autonomy decision/);
    expect((await actionRow(actionId)).cs_status).toBe('proposed');
  });
});
