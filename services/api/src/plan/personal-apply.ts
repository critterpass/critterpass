/**
 * "Apply to my plan only" (the personal overlay): the member's accepted ops become their own
 * `personal_plan_ops` row, visible to nobody else; the crew's plan changes only where they skip an
 * item, by dropping them from its attendees (their share is re-priced, the alternative stays
 * private). A booked item keeps its attendees: skipping it saves nothing. Snapshots are refreshed
 * from the current version so a later crew change shows up as a clash, not a silent overwrite.
 */
import {
  changeSetOpsToEdits,
  DomainError,
  type ChangeSetOp,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';
import { changedSince, conflictsWith } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { tripVoters } from './access';
import { advance, type ChangeSetRow } from './changeset-store';
import { commitPlanVersion, loadPlanState, lockTripPlan, replay } from './versioning';

function snapshotOf(item: PlanStateItem): ChangeSetOp['before'] {
  const { stable_id: _id, locked_reason: _lock, created_by_kind: _by, lane, ...rest } = item;
  const snapshot = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null));
  return { ...snapshot, ...(typeof lane === 'string' ? { lane } : {}) };
}

/** The ops with `before` taken from `state` (a crew-removed item keeps its last snapshot). */
export function refreshBefore(state: PlanState, ops: readonly ChangeSetOp[]): ChangeSetOp[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  return ops.map((op) => {
    const item = op.op === 'add' ? undefined : byId.get(op.target);
    return item === undefined ? op : { ...op, before: snapshotOf(item) };
  });
}

export interface PersonalApplyResult {
  readonly personal_ops_id: string;
  readonly version_id: string | null;
}

export async function applyPersonally(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  uid: string,
): Promise<PersonalApplyResult> {
  if (row.status === 'stale') throw new DomainError('STATE_INVALID', { state: 'stale' });
  const head = await lockTripPlan(tx, row.trip_id);
  const current = head.currentVersionId;
  if (current === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
  const state = await loadPlanState(tx, current);
  const accepted = row.ops.filter((op) => op.accepted !== false);
  if (accepted.length === 0) throw new DomainError('STATE_INVALID', { reason: 'nothing_accepted' });
  if (row.base_version_id !== current) {
    const base = await loadPlanState(tx, row.base_version_id);
    if (conflictsWith(changeSetOpsToEdits(accepted), changedSince(base, state)).length > 0) {
      throw new DomainError('STATE_INVALID', { state: 'stale' });
    }
  }
  replay(state, changeSetOpsToEdits(accepted));
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const voters = await tripVoters(tx, row.trip_id, row.crew_id);
  const skips = accepted.flatMap((op) => {
    const item = op.op === 'remove' ? byId.get(op.target) : undefined;
    if (item === undefined || item.booking_id) return [];
    const attendees = item.attendee_ids?.length ? item.attendee_ids : voters;
    return attendees.includes(uid) ? [{ item, attendees }] : [];
  });
  let versionId: string | null = null;
  if (skips.length > 0) {
    const next = replay(
      state,
      skips.map(({ item, attendees }) => ({
        kind: 'patch' as const,
        stableId: item.stable_id,
        patch: { attendee_ids: attendees.filter((id) => id !== uid) },
      })),
    );
    versionId = await commitPlanVersion(tx, {
      head,
      baseVersionId: current,
      next,
      actor: { kind: 'user', id: uid },
      source: 'attendance',
      opCount: skips.length,
      ops: null,
    });
  }
  // As the member: RLS keeps the row theirs alone.
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO personal_plan_ops (trip_id, user_id, change_set_id, base_version_id, ops)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (change_set_id, user_id) WHERE change_set_id IS NOT NULL
     DO UPDATE SET ops = EXCLUDED.ops, base_version_id = EXCLUDED.base_version_id, status = 'active'
     RETURNING id`,
    [
      row.trip_id,
      uid,
      row.id,
      versionId ?? current,
      JSON.stringify(refreshBefore(state, accepted)),
    ],
  );
  if (row.author_id === uid && row.status === 'draft') {
    await asSystemRole(tx, () =>
      tx.query("UPDATE change_sets SET scope = 'personal' WHERE id = $1", [row.id]),
    );
    await advance(tx, row, ['proposed', 'approved', 'applied'], { kind: 'self', uid });
  }
  return { personal_ops_id: rows[0]?.id as string, version_id: versionId };
}
