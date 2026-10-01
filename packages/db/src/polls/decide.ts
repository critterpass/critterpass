/**
 * Whether the ballots a poll already holds decide it: everyone eligible has voted, or the poll's
 * approval decider is satisfied. Asked after every ballot, and again when a destination board moves
 * to its final, because ballots on the two finalists carry over and can already decide the final
 * with nobody needing to vote again. A destination board itself is never decided here; it advances.
 */
import { evaluateDecider, type DeciderOutcome } from '@cp/domain';
import type pg from 'pg';

import { tallyOf, type PollState } from './state';

export async function decideOnBallots(
  tx: pg.PoolClient,
  state: PollState,
): Promise<DeciderOutcome> {
  const { poll } = state;
  if (poll.kind === 'destination' && poll.stage !== 'final') return { decided: false };
  let organiserIds: string[] = [];
  if (poll.trip_id !== null) {
    const { rows } = await tx.query<{ user_id: string }>(
      "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'",
      [poll.trip_id],
    );
    organiserIds = rows.map((row) => row.user_id);
  }
  return evaluateDecider({
    policy: poll.decider_policy,
    threshold: poll.threshold,
    tally: tallyOf(state),
    approveOptionId: state.options.find((option) => option.eliminated_at === null)?.id ?? null,
    organiserIds:
      organiserIds.length > 0 || poll.created_by === null ? organiserIds : [poll.created_by],
  });
}
