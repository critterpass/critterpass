/**
 * `guide_action.execute` (docs/product-decisions.md, approval authority): decide a planned GuideAction with
 * the autonomy policy and act on the decision, in one system transaction.
 *
 * - `auto`: the decider audit is written onto the running action first, then the change set is
 *   approved with `approved_by_kind = 'policy'` (the database refuses that without the audit row),
 *   applied through `app.apply_change_set`, given its undo window (and the timer that closes it),
 *   and announced (`change_set.applied` by the guide → activity ticker; `guide.touched` on
 *   `trip_plan`).
 * - `needs_yes`: the action waits in `needs_approval` with a `changeset_approval` poll draft in its
 *   audit, for the poll engine; once the change set is approved, `applyApprovedGuideAction` runs it.
 * - `forbidden`: recorded and failed; nothing runs.
 *
 * Any error rolls the whole transaction back (nothing half-applied); after the last retry the
 * action is marked failed.
 */
import { emitEvent, outbox, scheduleEvent, withSystem } from '@cp/db';
import {
  changeSetOpsSchema,
  channelName,
  decideAutonomy,
  DomainError,
  undoWindowEnd,
  type AutonomyDecision,
  type ChangeSetOps,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../boss';
import { GUIDE_ACTION_EXECUTE_QUEUE } from './plan';

export const GUIDE_ACTION_UNDO_EXPIRE_QUEUE = 'guide_action.undo_expire';

export interface ExecuteOptions {
  readonly now?: () => Date;
  readonly undoWindowMs?: number;
  readonly approvalWindowMs?: number;
}

interface ActionRow {
  readonly id: string;
  readonly trip_id: string;
  readonly kind: string;
  readonly status: string;
  readonly reversible: boolean;
  readonly cost_delta_minor: string | null;
  readonly audit: {
    readonly inputs?: {
      readonly requester_id?: string | null;
      /** A disruption's travellers, read from the disruption row when the action was planned. */
      readonly owner_ids?: readonly string[];
      readonly time_critical?: boolean;
      readonly hold_expires_at?: readonly string[];
    };
    readonly affected_user_ids?: readonly string[];
  };
  readonly change_set_id: string;
  readonly change_set_status: string;
  readonly author_id: string;
  readonly ops: unknown;
  readonly crew_id: string;
  readonly trip_status: string;
}

export type ExecuteOutcome =
  | { readonly status: 'done'; readonly versionId: string; readonly undoUntil: string | null }
  | { readonly status: 'needs_approval'; readonly decision: AutonomyDecision }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'skipped'; readonly current: string };

async function loadForUpdate(tx: pg.PoolClient, id: string): Promise<ActionRow | undefined> {
  const { rows } = await tx.query<ActionRow>(
    `SELECT ga.id, ga.trip_id, ga.kind, ga.status, ga.reversible, ga.cost_delta_minor::text, ga.audit,
            ga.change_set_id, cs.status AS change_set_status, cs.author_id, cs.ops,
            t.crew_id, t.status AS trip_status
       FROM guide_actions ga
       JOIN change_sets cs ON cs.id = ga.change_set_id
       JOIN trips t ON t.id = ga.trip_id
      WHERE ga.id = $1
      FOR UPDATE OF ga, cs`,
    [id],
  );
  return rows[0];
}

async function setStatus(
  tx: pg.PoolClient,
  id: string,
  status: string,
  audit: Record<string, unknown> = {},
): Promise<void> {
  await tx.query('UPDATE guide_actions SET status = $2, audit = audit || $3::jsonb WHERE id = $1', [
    id,
    status,
    JSON.stringify(audit),
  ]);
}

function itemStarts(ops: ChangeSetOps): Date[] {
  return ops
    .flatMap((op) => [op.before?.starts_at, op.after?.starts_at])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => new Date(value));
}

async function applyAndFinish(
  tx: pg.PoolClient,
  row: ActionRow,
  ops: ChangeSetOps,
  now: Date,
  options: ExecuteOptions,
): Promise<ExecuteOutcome> {
  const { rows } = await tx.query<{ version: string | null }>(
    'SELECT app.apply_change_set($1)::text AS version',
    [row.change_set_id],
  );
  const versionId = rows[0]?.version ?? null;
  if (versionId === null) {
    await setStatus(tx, row.id, 'failed', {
      failure: { reason: 'stale_base', at: now.toISOString() },
    });
    return { status: 'failed', reason: 'stale_base' };
  }
  const undoUntil = row.reversible
    ? undoWindowEnd(now, itemStarts(ops), options.undoWindowMs)
    : null;
  await tx.query("UPDATE guide_actions SET status = 'done', undo_until = $2 WHERE id = $1", [
    row.id,
    undoUntil,
  ]);
  if (undoUntil !== null && undoUntil > now) {
    await scheduleEvent(tx, {
      kind: GUIDE_ACTION_UNDO_EXPIRE_QUEUE,
      refId: row.id,
      tz: 'UTC',
      at: undoUntil,
    });
  }
  await emitEvent(tx, {
    type: 'change_set.applied',
    aggregateKind: 'change_set',
    aggregateId: row.change_set_id,
    actorKind: 'guide',
    actorId: row.author_id,
    payload: {
      trip_id: row.trip_id,
      change_set_id: row.change_set_id,
      result_version_id: versionId,
    },
    tripId: row.trip_id,
    crewId: row.crew_id,
  });
  await outbox(tx, channelName('trip_plan', row.trip_id), 'guide.touched', {
    action_id: row.id,
    change_set_id: row.change_set_id,
    version_id: versionId,
    kind: row.kind,
    undo_until: undoUntil?.toISOString() ?? null,
  });
  return { status: 'done', versionId, undoUntil: undoUntil?.toISOString() ?? null };
}

/** Decides and acts on one planned action; a replay of a decided action changes nothing. */
export async function executeGuideAction(
  tx: pg.PoolClient,
  actionId: string,
  options: ExecuteOptions = {},
): Promise<ExecuteOutcome> {
  const row = await loadForUpdate(tx, actionId);
  if (row === undefined) return { status: 'skipped', current: 'missing' };
  if (row.status !== 'planned') return { status: 'skipped', current: row.status };
  const now = options.now?.() ?? new Date();
  const ops = changeSetOpsSchema.parse(row.ops);
  const inputs = row.audit.inputs ?? {};
  const decision = decideAutonomy(
    {
      kind: row.kind,
      reversible: row.reversible,
      costDeltaMinor: Number(row.cost_delta_minor ?? 0),
      bookingImpact: ops.some((op) => op.booking_impact),
      affectedUserIds: row.audit.affected_user_ids ?? [],
      requesterId: inputs.requester_id ?? null,
      ...(inputs.owner_ids === undefined ? {} : { ownerIds: inputs.owner_ids }),
      timeCritical: inputs.time_critical === true,
    },
    {
      now,
      inTrip: row.trip_status === 'in_trip',
      holdExpiries: (inputs.hold_expires_at ?? []).map((value) => new Date(value)),
      itemStarts: itemStarts(ops),
      ...(options.approvalWindowMs === undefined
        ? {}
        : { approvalWindowMs: options.approvalWindowMs }),
    },
  );
  const decider = { ...decision, decided_at: now.toISOString() };

  if (decision.outcome === 'forbidden') {
    await setStatus(tx, row.id, 'running', { decider });
    await setStatus(tx, row.id, 'failed', { failure: { reason: decision.reason } });
    return { status: 'failed', reason: decision.reason };
  }
  if (decision.outcome === 'needs_yes') {
    await setStatus(tx, row.id, 'needs_approval', {
      decider,
      poll_draft: {
        kind: 'changeset_approval',
        change_set_id: row.change_set_id,
        decider_policy: decision.decider_policy,
        threshold: decision.threshold,
        tie_breaker: decision.tie_breaker,
        affected_user_ids: decision.affected_user_ids,
        closes_at: decision.closes_at,
      },
    });
    await emitEvent(tx, {
      type: 'change_set.proposed',
      aggregateKind: 'change_set',
      aggregateId: row.change_set_id,
      actorKind: 'guide',
      actorId: row.author_id,
      payload: { trip_id: row.trip_id, change_set_id: row.change_set_id },
      tripId: row.trip_id,
      crewId: row.crew_id,
    });
    return { status: 'needs_approval', decision };
  }
  await setStatus(tx, row.id, 'running', { decider });
  await tx.query(
    "UPDATE change_sets SET status = 'approved', approved_by_kind = 'policy', approved_by = NULL WHERE id = $1",
    [row.change_set_id],
  );
  return applyAndFinish(tx, row, ops, now, options);
}

/** Runs a needs-a-yes action once its change set was approved by a vote or a person. */
export async function applyApprovedGuideAction(
  tx: pg.PoolClient,
  actionId: string,
  options: ExecuteOptions = {},
): Promise<ExecuteOutcome> {
  const row = await loadForUpdate(tx, actionId);
  if (row === undefined) throw new DomainError('NOT_FOUND');
  if (row.status !== 'needs_approval' || row.change_set_status !== 'approved') {
    throw new DomainError('STATE_INVALID', {
      status: row.status,
      change_set: row.change_set_status,
    });
  }
  const now = options.now?.() ?? new Date();
  await setStatus(tx, row.id, 'running');
  return applyAndFinish(tx, row, changeSetOpsSchema.parse(row.ops), now, options);
}

async function markFailed(tx: pg.PoolClient, id: string, error: unknown): Promise<void> {
  const { rowCount } = await tx.query(
    "UPDATE guide_actions SET status = 'running' WHERE id = $1 AND status = 'planned'",
    [id],
  );
  if (rowCount !== 1) return;
  const message = error instanceof Error ? error.message : String(error);
  await setStatus(tx, id, 'failed', {
    failure: { reason: 'error', message: message.slice(0, 500) },
  });
}

const payloadSchema = z.object({ action_id: z.uuid() });

export function guideActionExecuteJob(
  options: ExecuteOptions = {},
): JobDefinition<z.infer<typeof payloadSchema>> {
  return defineJob({
    queue: GUIDE_ACTION_EXECUTE_QUEUE,
    schema: payloadSchema,
    singletonKey: (data) => data.action_id,
    handler: async ({ action_id: id }, ctx) => {
      try {
        return { ...(await withSystem(ctx.pool, (tx) => executeGuideAction(tx, id, options))) };
      } catch (error) {
        if (ctx.job.isFinalAttempt) await withSystem(ctx.pool, (tx) => markFailed(tx, id, error));
        throw error;
      }
    },
  });
}
