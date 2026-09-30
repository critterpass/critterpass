/**
 * Who decides a member's change set, and when it is decided (docs/product-decisions.md, approval
 * authority). The defaults are the guide's autonomy policy applied to a member's own change:
 * money or others affected → a majority of the affected, the organiser breaking a tie;
 * time-critical in-trip → any one affected member (with UNDO); only the author affected → the
 * author alone (applied at once, no vote). The vote closes by the approval window, the start of a
 * touched item still ahead and the earliest hold, whichever comes first; at the deadline an
 * undecided vote keeps the current plan.
 */
import {
  approvalClosesAt,
  clampClosesAt,
  decideAutonomy,
  type ChangeSetOp,
  type PollDeciderPolicy,
} from '@cp/domain';

export interface PolicyInput {
  readonly authorId: string;
  readonly ops: readonly ChangeSetOp[];
  /** Everyone the change touches: the ops' own list and the attendees of the touched items. */
  readonly affectedUserIds: readonly string[];
  readonly costDeltaMinor: number;
  readonly inTrip: boolean;
  readonly now: Date;
  readonly itemStarts: readonly Date[];
  readonly holdExpiry: Date | null;
  /** The author asked for a fixed number of yeses (`threshold_n`) or a specific policy. */
  readonly requested?: { readonly policy?: PollDeciderPolicy; readonly threshold?: number };
}

export type PolicyChoice =
  | { readonly policy: 'self' }
  | {
      readonly policy: PollDeciderPolicy;
      readonly threshold: number | null;
      readonly affectedUserIds: readonly string[];
      readonly closesAt: Date;
    };

export function chooseDeciderPolicy(input: PolicyInput): PolicyChoice {
  const affected = [...new Set(input.affectedUserIds)].sort();
  const closesAt = clampClosesAt(
    approvalClosesAt({ now: input.now, inTrip: input.inTrip, itemStarts: input.itemStarts }),
    input.holdExpiry,
  );
  if (input.requested?.threshold !== undefined) {
    return {
      policy: 'threshold_n',
      threshold: Math.min(input.requested.threshold, Math.max(affected.length, 1)),
      affectedUserIds: affected,
      closesAt,
    };
  }
  if (input.requested?.policy !== undefined && input.requested.policy !== 'threshold_n') {
    return { policy: input.requested.policy, threshold: null, affectedUserIds: affected, closesAt };
  }
  const decision = decideAutonomy(
    {
      kind: 'move_item',
      reversible: true,
      costDeltaMinor: input.costDeltaMinor,
      bookingImpact: input.ops.some((op) => op.booking_impact),
      affectedUserIds: affected,
      requesterId: input.authorId,
      timeCritical: input.inTrip && input.itemStarts.some((start) => start > input.now),
    },
    { now: input.now, inTrip: input.inTrip },
  );
  // A member's plan change is a plan action (never a forbidden kind): auto or self means theirs alone.
  if (decision.outcome !== 'needs_yes' || decision.decider_policy === 'self') {
    return { policy: 'self' };
  }
  return {
    policy: decision.decider_policy,
    threshold: decision.decider_policy === 'threshold_n' ? decision.threshold : null,
    affectedUserIds: affected,
    closesAt,
  };
}

export interface VoteFacts {
  readonly policy: PollDeciderPolicy;
  readonly threshold: number | null;
  readonly eligible: readonly string[];
  readonly yes: readonly string[];
  readonly no: readonly string[];
  readonly organiserIds: readonly string[];
  /** An organiser outside the vote breaking a tie ("organiser breaks ties"). */
  readonly tieBreak?: 'yes' | 'no';
}

export type Verdict = 'approve' | 'reject' | 'pending' | 'tie';

/** Yes votes needed among `n` eligible voters. */
export function yesNeeded(policy: PollDeciderPolicy, n: number, threshold: number | null): number {
  switch (policy) {
    case 'organiser':
    case 'any_affected':
      return 1;
    case 'majority_of_affected':
      return Math.floor(n / 2) + 1;
    case 'threshold_n':
      return Math.max(1, Math.min(threshold ?? 1, n));
  }
}

/**
 * The vote's state: decided either way, still open, or a majority vote split evenly with nobody
 * left to vote (`tie`), which an organiser's own ballot, or an organiser outside the vote, breaks.
 */
export function verdict(facts: VoteFacts): Verdict {
  const organisers = new Set(facts.organiserIds);
  if (facts.policy === 'organiser') {
    if (facts.yes.some((uid) => organisers.has(uid))) return 'approve';
    if (facts.no.some((uid) => organisers.has(uid))) return 'reject';
    return facts.tieBreak === undefined
      ? 'pending'
      : facts.tieBreak === 'yes'
        ? 'approve'
        : 'reject';
  }
  const n = facts.eligible.length;
  const yes = facts.yes.length;
  const no = facts.no.length;
  const pending = n - yes - no;
  if (facts.policy === 'any_affected') {
    if (yes >= 1) return 'approve';
    return pending === 0 ? 'reject' : 'pending';
  }
  const needed = yesNeeded(facts.policy, n, facts.threshold);
  if (yes >= needed) return 'approve';
  if (facts.policy === 'majority_of_affected' && n % 2 === 0 && yes + pending >= n / 2) {
    // An even split is still possible: a tie goes to the organiser.
    if (pending > 0) return 'pending';
    if (facts.yes.some((uid) => organisers.has(uid))) return 'approve';
    if (facts.no.some((uid) => organisers.has(uid))) return 'reject';
    if (facts.tieBreak !== undefined) return facts.tieBreak === 'yes' ? 'approve' : 'reject';
    return 'tie';
  }
  if (yes + pending < needed) return 'reject';
  return 'pending';
}

/** At the deadline: a decided vote stands; anything undecided keeps the current plan. */
export function verdictAtExpiry(facts: VoteFacts): 'approve' | 'reject' | 'expired' {
  const now = verdict(facts);
  return now === 'approve' || now === 'reject' ? now : 'expired';
}
