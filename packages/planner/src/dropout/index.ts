/**
 * The dropout re-split (3f-7): the cost engine re-packs rooms and re-splits shared costs without
 * the leaver; this module turns that into the ChangeSet the organiser applies or sends to a vote,
 * and the before/after per member the screen rolls ("$1,310 → $1,334"). Nothing moves until the
 * change set is applied.
 */
import { dropout, stateShares, type TripCostState } from '@cp/cost-engine';
import type { MemberResplitWire, ProposalOp } from '@cp/domain';

import { resplitOps, type ResplitExtras } from './resplit';
import { roomOps } from './rooms';

export * from './cost-state';
export * from './resplit';
export * from './rooms';

export interface DropoutChangeSet {
  readonly ops: readonly ProposalOp[];
  readonly members: readonly MemberResplitWire[];
  /** Sum of every remaining member's change (the crew's cost delta), minor units. */
  readonly costDeltaMinor: bigint;
  /** Σ remaining shares before and after; the after total is exactly the re-split state's. */
  readonly totalAfterMinor: bigint | null;
}

export function buildDropoutChangeSet(
  state: TripCostState,
  extras: ResplitExtras,
): DropoutChangeSet {
  const result = dropout(state, extras.leaver);
  const ops = [...roomOps(result.changes), ...resplitOps(result.changes, extras)];
  const members = result.members.map((member) => ({
    uid: member.uid,
    before_minor: member.before.amountMinor.toString(),
    after_minor: member.after.amountMinor.toString(),
    delta_minor: member.delta.amountMinor.toString(),
    display_delta_minor: member.displayDelta.amountMinor.toString(),
  }));
  const after = stateShares(result.state);
  return {
    ops,
    members,
    costDeltaMinor: result.members.reduce((sum, member) => sum + member.delta.amountMinor, 0n),
    totalAfterMinor: after.status === 'ok' ? after.totalMinor : null,
  };
}
