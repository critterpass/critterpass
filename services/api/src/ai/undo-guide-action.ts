/**
 * `undo_guide_action` (docs/api-contracts.md §4.3; docs/product-decisions.md, UNDO): undo something
 * the guide did, from the inbox row (3b-4), live collab (3g-2) or the disruption stream (3k-5).
 * `{action_id}` undoes one action; `{disruption_id}` is "Undo everything": every still-undoable
 * action of that disruption, newest first. Allowed for an affected member or an organiser, within
 * the action's undo window. The undo itself is `app.undo_guide_action` (the inverse ChangeSet, a
 * compensating action, the original set reverted), run as the caller; an action already undone
 * answers with its first undo, and a replayed op_id gets its stored result from the pipeline.
 */
import { DomainError, type CommandContext } from '@cp/domain';
import { emitEvent } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineCommand } from '../commands/_framework/define-command';

export const UNDO_GUIDE_ACTION = 'undo_guide_action';

const payloadSchema = z.union([
  z.strictObject({ action_id: z.uuid() }),
  z.strictObject({ disruption_id: z.uuid() }),
]);
type Payload = z.infer<typeof payloadSchema>;

interface Target {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly undoable: boolean;
  readonly allowed: boolean;
}

interface UndoRow {
  readonly action_id: string;
  readonly undo_action_id: string;
  readonly change_set_id: string;
  readonly version_id?: string;
  readonly trip_id: string;
  readonly already_undone: boolean;
}

// Runs as the caller: RLS on guide_actions leaves only actions on trips they belong to.
const TARGETS_SQL = `
  SELECT ga.id, ga.trip_id, t.crew_id, ga.status,
         (ga.status = 'done' AND ga.reversible AND ga.undo_until > now()) AS undoable,
         (app.is_trip_organiser(ga.trip_id)
           OR COALESCE(ga.audit -> 'affected_user_ids' ? $2::text, false)) AS allowed
    FROM guide_actions ga JOIN trips t ON t.id = ga.trip_id
   WHERE ga.compensates_id IS NULL AND `;

async function targetsOf(tx: pg.PoolClient, payload: Payload, uid: string): Promise<Target[]> {
  const [where, id] =
    'action_id' in payload
      ? ['ga.id = $1', payload.action_id]
      : ['ga.disruption_id = $1 ORDER BY ga.created_at DESC, ga.id DESC', payload.disruption_id];
  const { rows } = await tx.query<Target>(`${TARGETS_SQL}${where}`, [id, uid]);
  return rows;
}

interface PgError {
  readonly code?: string;
  readonly hint?: string;
}

function toDomainError(error: unknown): unknown {
  const { code, hint } = (error ?? {}) as PgError;
  if (code === 'P0002') return new DomainError('NOT_FOUND');
  if (code === '42501') return new DomainError('FORBIDDEN', { reason: hint ?? 'not_allowed' });
  if (code === '55000') return new DomainError('STATE_INVALID', { reason: hint ?? 'not_undoable' });
  if (code === '40001')
    return new DomainError('VERSION_CONFLICT', { reason: hint ?? 'plan_changed' });
  return error;
}

async function undoOne(tx: pg.PoolClient, target: Target, ctx: CommandContext): Promise<UndoRow> {
  let result: UndoRow | undefined;
  try {
    const { rows } = await tx.query<{ result: UndoRow }>(
      'SELECT app.undo_guide_action($1, $2) AS result',
      [target.id, ctx.uid],
    );
    result = rows[0]?.result;
  } catch (error) {
    throw toDomainError(error);
  }
  if (result === undefined) throw new Error('app.undo_guide_action returned no row');
  if (!result.already_undone) {
    await emitEvent(tx, {
      type: 'guide_action.undone',
      aggregateKind: 'guide_action',
      aggregateId: target.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        trip_id: target.trip_id,
        action_id: target.id,
        undo_action_id: result.undo_action_id,
        change_set_id: result.change_set_id,
      },
      tripId: target.trip_id,
      crewId: target.crew_id,
    });
  }
  return result;
}

export const undoGuideActionCommand = defineCommand({
  name: UNDO_GUIDE_ACTION,
  v: 1,
  schema: payloadSchema,
  offline: true,
  // Crew members are often still anonymous; the membership and affected checks decide.
  allowAnonymous: true,
  actionScope: 'changeset',
  authorize: async (tx, payload, ctx) => {
    const targets = await targetsOf(tx, payload, ctx.uid);
    if (targets.length === 0) throw new DomainError('NOT_FOUND');
    const single = 'action_id' in payload ? targets[0] : undefined;
    if (single !== undefined) {
      // An action already undone answers with its first undo (handled by the undo itself).
      if (single.status === 'undone') return;
      if (!single.allowed) throw new DomainError('FORBIDDEN', { reason: 'not_affected' });
      if (!single.undoable) {
        const reason = single.status === 'done' ? 'undo_window_closed' : 'not_undoable';
        throw new DomainError('STATE_INVALID', { reason });
      }
      return;
    }
    if (targets.some((target) => target.undoable && !target.allowed)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_affected' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const targets = await targetsOf(tx, payload, ctx.uid);
    const chosen = 'action_id' in payload ? targets : targets.filter((target) => target.undoable);
    const undone: UndoRow[] = [];
    for (const target of chosen) undone.push(await undoOne(tx, target, ctx));
    const skipped = targets
      .filter((target) => !chosen.includes(target))
      .map((target) => ({ action_id: target.id, status: target.status }));
    return { undone, skipped };
  },
});
