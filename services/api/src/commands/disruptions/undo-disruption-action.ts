/**
 * `undo_disruption_action {disruption_id, action_id | 'all'}` (docs/api-contracts-trip.md §4.12):
 * takes back what the guide did, newest first (packages/planner `planUndo`).
 * - A done plan row is undone through `app.undo_guide_action` as the caller (an affected member or
 *   an organiser, inside the undo window, on an unchanged plan), exactly like UNDO on the change.
 * - A row still waiting (a question, a draft, a retime waiting on a vendor) is withdrawn.
 * - A message the vendor already received cannot be unsent: the worker drafts its compensation
 *   ("Tell Made: back to 11:40?"), which again needs a yes (`disruption.action_undone`).
 * Undoing everything also closes the disruption as `undone`.
 */
import { appendDomainEvent, emitEvent } from '@cp/db';
import { DomainError, undoDisruptionActionPayloadSchema, type DisruptionAction } from '@cp/domain';
import { planUndo } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireDisruption, requireRow, saveRows, type DisruptionView } from './shared';

interface PgError {
  readonly code?: string;
  readonly hint?: string;
}

function toDomainError(error: unknown): unknown {
  const { code, hint } = (error ?? {}) as PgError;
  if (code === '42501') return new DomainError('FORBIDDEN', { reason: hint ?? 'not_allowed' });
  if (code === '55000') return new DomainError('STATE_INVALID', { reason: hint ?? 'not_undoable' });
  if (code === '40001')
    return new DomainError('VERSION_CONFLICT', { reason: hint ?? 'plan_changed' });
  return error;
}

function targets(view: DisruptionView, actionId: string): DisruptionAction[] {
  return actionId === 'all' ? view.actions : [requireRow(view, actionId)];
}

async function undoPlanRow(
  tx: pg.PoolClient,
  view: DisruptionView,
  row: DisruptionAction,
  uid: string,
): Promise<void> {
  if (row.guide_action_id === null) return;
  let result: { undo_action_id: string; change_set_id: string; already_undone: boolean };
  try {
    const { rows } = await tx.query<{ result: typeof result }>(
      'SELECT app.undo_guide_action($1, $2) AS result',
      [row.guide_action_id, uid],
    );
    if (rows[0] === undefined) throw new Error('app.undo_guide_action returned no row');
    result = rows[0].result;
  } catch (error) {
    throw toDomainError(error);
  }
  if (result.already_undone) return;
  await emitEvent(tx, {
    type: 'guide_action.undone',
    aggregateKind: 'guide_action',
    aggregateId: row.guide_action_id,
    actorKind: 'user',
    actorId: uid,
    payload: {
      trip_id: view.trip_id,
      action_id: row.guide_action_id,
      undo_action_id: result.undo_action_id,
      change_set_id: result.change_set_id,
    },
    tripId: view.trip_id,
    crewId: view.crew_id,
  });
}

export const undoDisruptionActionCommand = defineCommand({
  name: 'undo_disruption_action',
  v: 1,
  schema: undoDisruptionActionPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    // Undo everything is an organiser's or a disrupted traveller's; one row, also its affected.
    const approvers = new Set(
      payload.action_id === 'all'
        ? view.traveller_ids
        : [...view.traveller_ids, ...requireRow(view, payload.action_id).affected_user_ids],
    );
    if (!view.organiser && !approvers.has(ctx.uid)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_an_approver' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    const steps = planUndo(targets(view, payload.action_id));
    let undone = 0;
    let compensations = 0;
    const moved = new Map<string, DisruptionAction>();
    for (const step of steps) {
      if (step.step === 'undo_guide_action') {
        await undoPlanRow(tx, view, step.action, ctx.uid);
        moved.set(step.action.id, { ...step.action, state: 'undone' });
        undone += 1;
      } else if (step.step === 'compensate') {
        compensations += 1;
      } else {
        moved.set(step.action.id, { ...step.action, state: 'withdrawn' });
      }
    }
    return asSystemRole(tx, async () => {
      for (const row of moved.values()) {
        if (row.state !== 'withdrawn') continue;
        if (row.poll !== null) {
          await tx.query(
            "UPDATE polls SET status = 'cancelled', version = version + 1 WHERE id = $1 AND status = 'open'",
            [row.poll.id],
          );
        }
        if (row.vendor_message_id !== null) {
          await tx.query(
            `UPDATE ops.vendor_messages SET status = 'superseded', version = version + 1
              WHERE id = $1 AND status = 'draft'`,
            [row.vendor_message_id],
          );
        }
      }
      const rows = view.actions.map((row) => moved.get(row.id) ?? row);
      await saveRows(tx, view, rows, [...moved.values()]);
      if (payload.action_id === 'all') {
        await tx.query(
          `UPDATE disruptions SET status = 'undone', resolved_at = now(), version = version + 1
            WHERE id = $1 AND status = 'open'`,
          [view.id],
        );
      }
      await appendDomainEvent(tx, {
        type: 'disruption.action_undone',
        aggregateKind: 'trip',
        aggregateId: view.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: view.crew_id,
        tripId: view.trip_id,
        payload: {
          trip_id: view.trip_id,
          disruption_id: view.id,
          action_id: payload.action_id,
          undone,
          compensations,
        },
      });
      return { disruption_id: view.id, undone, compensations };
    });
  },
});
