/**
 * The undo side of guide actions that runs in the worker (docs/product-decisions.md, UNDO):
 *
 * - `guide_action.undo_expire`, fired by the per-object timer armed at `undo_until`, closes the
 *   window in the synced row (`audit.undo_closed_at`) so every surface drops its UNDO button, and
 *   tells the trip plan channel. The undo itself is refused after `undo_until` whether or not this
 *   job has run yet (`app.undo_guide_action` checks the clock).
 * - `undoGuideAction` is the system-side call of `app.undo_guide_action` (the same function the
 *   `undo_guide_action` command uses), for flows that undo on a person's behalf.
 */
import { outbox, scheduledJobDataSchema, withSystem } from '@cp/db';
import { channelName } from '@cp/domain';
import type pg from 'pg';

import { defineJob } from '../boss';
import { GUIDE_ACTION_UNDO_EXPIRE_QUEUE } from './execute';

export interface UndoResult {
  readonly action_id: string;
  readonly undo_action_id: string;
  readonly change_set_id: string;
  readonly version_id?: string;
  readonly trip_id: string;
  readonly already_undone: boolean;
}

export async function undoGuideAction(
  tx: pg.PoolClient,
  actionId: string,
  actorId: string,
): Promise<UndoResult> {
  const { rows } = await tx.query<{ result: UndoResult }>(
    'SELECT app.undo_guide_action($1, $2) AS result',
    [actionId, actorId],
  );
  const result = rows[0]?.result;
  if (result === undefined) throw new Error('app.undo_guide_action returned no row');
  return result;
}

/** Marks an elapsed undo window closed; false when there was nothing (left) to close. */
export async function closeUndoWindow(tx: pg.PoolClient, actionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ trip_id: string }>(
    `UPDATE guide_actions
        SET audit = audit || jsonb_build_object('undo_closed_at', now())
      WHERE id = $1 AND status = 'done' AND undo_until <= now() AND NOT audit ? 'undo_closed_at'
      RETURNING trip_id`,
    [actionId],
  );
  const row = rows[0];
  if (row === undefined) return false;
  await outbox(tx, channelName('trip_plan', row.trip_id), 'guide.undo_closed', {
    action_id: actionId,
  });
  return true;
}

export function guideActionUndoExpireJob() {
  return defineJob({
    queue: GUIDE_ACTION_UNDO_EXPIRE_QUEUE,
    schema: scheduledJobDataSchema,
    handler: async (data, ctx) => ({
      closed: await withSystem(ctx.pool, (tx) => closeUndoWindow(tx, data.ref_id)),
    }),
  });
}
