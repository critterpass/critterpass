/**
 * Hints on `trip_plan:{trip_id}` (docs/api-contracts-async.md §1): a new version with the ops that
 * made it, and every change set move. Hints carry ids, counts and ops only; the rows themselves
 * arrive through sync. `ops` is null when the batch is too large for a hint (the client then waits
 * for the synced version instead of replaying).
 */
import type { PlanOp } from './plan-ops';

export const PLAN_RT = {
  ops: 'plan.ops',
  changesetCreated: 'changeset.created',
  changesetToggled: 'changeset.item_toggled',
  changesetSent: 'changeset.sent',
  changesetTally: 'changeset.tally',
  changesetApplied: 'changeset.applied',
  changesetRejected: 'changeset.rejected',
  changesetExpired: 'changeset.expired',
  changesetStale: 'changeset.stale',
  changesetRebased: 'changeset.rebased',
  commentChanged: 'comment.changed',
} as const;

export interface PlanOpsHint {
  readonly version: string;
  readonly base_version: string;
  readonly ops: readonly PlanOp[] | null;
  readonly source: 'ops' | 'changeset' | 'attendance';
  readonly change_set_id: string | null;
}

export interface ChangesetTallyHint {
  readonly change_set_id: string;
  readonly poll_id: string;
  readonly yes: number;
  readonly no: number;
  readonly needed: number;
  readonly eligible: number;
}
