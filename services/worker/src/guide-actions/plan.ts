/**
 * Planning a guide action (docs/product-decisions.md, ChangeSet vs GuideAction): the guide never writes the plan. A
 * plan action becomes a guide-authored ChangeSet (`proposed`) plus a `planned` GuideAction carrying
 * its registered inverse, and a `guide_action.execute` job that decides and runs it — all in the
 * caller's system transaction. Each op's `before` is taken from the current plan, not from the
 * model, so an undo restores exactly what was there. Forbidden kinds never get this far.
 */
import { sendInTx } from '@cp/db';
import {
  changeSetOpsSchema,
  DomainError,
  isForbiddenActionKind,
  PLAN_ACTION_OPS,
  planItemSnapshotSchema,
  type ChangeSetOp,
  type ChangeSetScope,
  type ChangeSetTrigger,
  type PlanActionKind,
} from '@cp/domain';
import type pg from 'pg';

import { inverseFor } from './inverse-registry';

export const GUIDE_ACTION_EXECUTE_QUEUE = 'guide_action.execute';

export interface PlanGuideActionInput {
  readonly tripId: string;
  readonly kind: string;
  /** ChangeSet ops (packages/domain/src/plan/change-set-ops.ts); `before` is filled here. */
  readonly ops: unknown;
  /** The trip's guide: `change_sets.author_id` of the guide-authored set. */
  readonly guideId: string;
  /** Who asked the guide; null for a proactive action. */
  readonly requesterId: string | null;
  readonly scope?: ChangeSetScope;
  readonly trigger?: ChangeSetTrigger;
  readonly timeCritical?: boolean;
  readonly disruptionId?: string | null;
  readonly costDeltaMinor?: number;
  /** Expiry of every supplier hold the action depends on (a vote must close before them). */
  readonly holdExpiresAt?: readonly string[];
}

export interface PlannedGuideAction {
  readonly actionId: string;
  readonly changeSetId: string;
  readonly reversible: boolean;
}

const SNAPSHOT_KEYS: readonly string[] = planItemSnapshotSchema.keyof().options;

type Snapshot = Record<string, unknown>;

async function currentSnapshots(
  tx: pg.PoolClient,
  versionId: string,
  targets: readonly string[],
): Promise<Map<string, Snapshot>> {
  const { rows } = await tx.query<{ stable_id: string; day_no: number; item: Snapshot }>(
    `SELECT pi.stable_id::text AS stable_id, d.day_no, to_jsonb(pi) AS item
       FROM plan_items pi JOIN plan_days d ON d.id = pi.day_id
      WHERE pi.version_id = $1 AND pi.stable_id = ANY($2::uuid[])`,
    [versionId, targets],
  );
  return new Map(
    rows.map((row) => [
      row.stable_id,
      {
        ...Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, row.item[key] ?? null])),
        day_no: row.day_no,
      },
    ]),
  );
}

/** A snapshot `before` the schema accepts, or null (a null in a non-nullable field: no clean undo). */
function validSnapshot(candidate: Snapshot): Snapshot | null {
  return planItemSnapshotSchema.safeParse(candidate).success ? candidate : null;
}

function withBefore(op: ChangeSetOp, current: ReadonlyMap<string, Snapshot>): ChangeSetOp {
  const snapshot = current.get(op.target);
  if (op.op === 'add') {
    if (snapshot !== undefined) {
      throw new DomainError('VALIDATION', { reason: 'plan_item_exists', target: op.target });
    }
    return { ...op, before: null };
  }
  if (snapshot === undefined) {
    throw new DomainError('VALIDATION', { reason: 'unknown_plan_item', target: op.target });
  }
  if (op.op === 'remove') return { ...op, before: validSnapshot(snapshot) };
  const keys = Object.keys(op.after ?? {});
  return {
    ...op,
    before: validSnapshot(Object.fromEntries(keys.map((key) => [key, snapshot[key]]))),
  };
}

/**
 * The members an action planned for a disruption acts for: the travellers the server's impact
 * analysis recorded on the open disruption row. Never an input: nothing a client, a command
 * payload or a model writes can widen what runs on its own.
 */
async function disruptionOwners(
  tx: pg.PoolClient,
  tripId: string,
  disruptionId: string | null,
): Promise<string[] | null> {
  if (disruptionId === null) return null;
  const { rows } = await tx.query<{ owners: unknown }>(
    `SELECT affected -> 'traveller_ids' AS owners FROM disruptions
      WHERE id = $1 AND trip_id = $2 AND status = 'open'`,
    [disruptionId, tripId],
  );
  if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'disruption' });
  const owners = rows[0].owners;
  return Array.isArray(owners) ? owners.filter((id): id is string => typeof id === 'string') : [];
}

export async function planGuideAction(
  tx: pg.PoolClient,
  input: PlanGuideActionInput,
): Promise<PlannedGuideAction> {
  if (isForbiddenActionKind(input.kind)) {
    throw new DomainError('FORBIDDEN', { reason: 'guide_drafts_only', kind: input.kind });
  }
  const kind = input.kind as PlanActionKind;
  const ops = changeSetOpsSchema.parse(input.ops);
  const allowed: readonly string[] = PLAN_ACTION_OPS[kind];
  if (ops.some((op) => !allowed.includes(op.op))) {
    throw new DomainError('VALIDATION', { reason: 'op_not_allowed_for_kind', kind });
  }
  const { rows: trips } = await tx.query<{ version: string | null }>(
    'SELECT current_version_id AS version FROM trips WHERE id = $1 FOR SHARE',
    [input.tripId],
  );
  const version = trips[0]?.version;
  if (version === undefined || version === null) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_has_no_plan' });
  }
  const current = await currentSnapshots(
    tx,
    version,
    ops.map((op) => op.target),
  );
  const filled = changeSetOpsSchema.parse(ops.map((op) => withBefore(op, current)));
  const inverse = inverseFor(kind, filled);
  const affected = [...new Set(filled.flatMap((op) => op.affected_user_ids))];
  const cost = input.costDeltaMinor ?? 0;
  const ownerIds = await disruptionOwners(tx, input.tripId, input.disruptionId ?? null);

  const { rows: sets } = await tx.query<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops, cost_delta_minor)
     VALUES ($1, $2, $3, $4, 'guide', $5, 'draft', $6, $7) RETURNING id`,
    [
      input.tripId,
      version,
      input.trigger ?? 'chat',
      input.scope ?? 'group',
      input.guideId,
      JSON.stringify(filled),
      cost,
    ],
  );
  const changeSetId = sets[0]?.id;
  if (changeSetId === undefined) throw new Error('change_sets insert returned no id');
  await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);

  const audit = {
    inputs: {
      requester_id: input.requesterId,
      ...(ownerIds === null ? {} : { owner_ids: ownerIds }),
      scope: input.scope ?? 'group',
      trigger: input.trigger ?? 'chat',
      time_critical: input.timeCritical ?? false,
      hold_expires_at: input.holdExpiresAt ?? [],
    },
    affected_user_ids: affected,
  };
  const { rows: actions } = await tx.query<{ id: string }>(
    `INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, cost_delta_minor, inverse, disruption_id, audit)
     VALUES ($1, $2, $3, 'planned', $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.tripId,
      changeSetId,
      kind,
      inverse !== null,
      cost,
      inverse === null ? null : JSON.stringify(inverse),
      input.disruptionId ?? null,
      JSON.stringify(audit),
    ],
  );
  const actionId = actions[0]?.id;
  if (actionId === undefined) throw new Error('guide_actions insert returned no id');
  await sendInTx(
    tx,
    GUIDE_ACTION_EXECUTE_QUEUE,
    { action_id: actionId },
    { singletonKey: actionId },
  );
  return { actionId, changeSetId, reversible: inverse !== null };
}
