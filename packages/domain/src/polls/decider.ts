/**
 * Early close by approval authority: an approval-style poll (options: approve first, then reject)
 * is decided as soon as its decider policy is satisfied, without waiting for everyone.
 *
 * - `organiser`: the first organiser ballot decides.
 * - `any_affected`: one approve decides; reject wins only once every voter has said no.
 * - `majority_of_affected`: a strict majority of the eligible voters either way.
 * - `threshold_n`: `threshold` approvals (capped at the voter count); reject once that can no longer
 *   be reached.
 *
 * Without a policy the poll is plurality: decided when everyone has voted (or at `closes_at`).
 */
import type { PollDeciderPolicy } from './kinds';
import type { Tally } from './tally';

export interface DeciderInput {
  readonly policy: PollDeciderPolicy | null;
  readonly threshold: number | null;
  readonly tally: Tally;
  /** Position-0 option; the other option is the rejection. */
  readonly approveOptionId: string | null;
  readonly organiserIds: readonly string[];
}

export type DeciderOutcome =
  | { readonly decided: false }
  | {
      readonly decided: true;
      readonly winnerOptionId: string | null;
      readonly reason: 'decider' | 'all_voted';
    };

const undecided: DeciderOutcome = { decided: false };

function countOf(tally: Tally, optionId: string | null): number {
  return tally.options.find((option) => option.optionId === optionId)?.count ?? 0;
}

function rejectOptionId(tally: Tally, approve: string | null): string | null {
  return tally.options.find((option) => option.optionId !== approve)?.optionId ?? null;
}

/** Yes votes needed for `policy` among `n` eligible voters. */
export function approvalsNeeded(
  policy: PollDeciderPolicy,
  n: number,
  threshold: number | null,
): number {
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

export function evaluateDecider(input: DeciderInput): DeciderOutcome {
  const { tally, policy } = input;
  if (policy === null) {
    return tally.allVoted
      ? { decided: true, winnerOptionId: null, reason: 'all_voted' }
      : undecided;
  }
  if (policy === 'organiser') {
    const organisers = new Set(input.organiserIds);
    for (const option of tally.options) {
      if (option.voterIds.some((uid) => organisers.has(uid))) {
        return { decided: true, winnerOptionId: option.optionId, reason: 'decider' };
      }
    }
    return undecided;
  }
  const approve = input.approveOptionId;
  const reject = rejectOptionId(tally, approve);
  const yes = countOf(tally, approve);
  const pending = tally.pendingVoterIds.length;
  const needed = approvalsNeeded(policy, tally.eligibleCount, input.threshold);
  if (yes >= needed) return { decided: true, winnerOptionId: approve, reason: 'decider' };
  if (yes + pending < needed) return { decided: true, winnerOptionId: reject, reason: 'decider' };
  return undecided;
}
