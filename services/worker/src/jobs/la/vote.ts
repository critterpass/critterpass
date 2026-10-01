/**
 * The vote-closing loader: a poll with a closing time goes on every eligible voter's lock screen
 * a day before it closes, with the live tallies and who has voted (as member hashes, so the one
 * broadcast frame stamps "you voted" on each phone). Closing or cancelling ends it with the result
 * as the final frame. A changeset approval is a yes/no on a plan change, not a vote to watch, so it
 * never gets one.
 */
import { loadPollState, tallyOf } from '@cp/db';
import {
  buildVoteLaAttributes,
  buildVoteLaState,
  LA_COPY,
  LA_VOTE_LEAD_MS,
  type VoteLaInput,
} from '@cp/domain';

import { clockIn, ROUTINE, type LaLoader } from './snapshot';

const LINGER_MS = 30 * 60_000;

export const voteLoader: LaLoader = async ({ tx, refId, now }) => {
  const state = await loadPollState(tx, refId);
  if (state === undefined || state.poll.kind === 'changeset_approval') return null;
  const { poll } = state;
  if (poll.closes_at === null) return null;
  const tally = tallyOf(state);
  const counts = new Map(tally.options.map((option) => [option.optionId, option]));
  const live = state.options.filter((option) => option.eliminated_at === null);
  const question = poll.question ?? live.map((option) => option.label).join(' / ');
  const input: VoteLaInput = {
    pollId: poll.id,
    question,
    status: poll.status,
    closesAt: poll.closes_at,
    options: live.map((option) => ({
      id: option.id,
      label: option.label,
      count: counts.get(option.id)?.count ?? 0,
    })),
    voterIds: tally.options.flatMap((option) => option.voterIds),
    eligibleCount: tally.eligibleCount,
    winnerOptionId: poll.winner_option_id,
  };
  const { rows } = await tx.query<{ tz: string | null }>('SELECT tz FROM trips WHERE id = $1', [
    poll.trip_id,
  ]);
  const closes = poll.closes_at.getTime();
  return {
    tripId: poll.trip_id,
    live:
      poll.status === 'open' && now.getTime() >= closes - LA_VOTE_LEAD_MS && now.getTime() < closes,
    audience: poll.eligible_voter_ids,
    attributes: () => Promise.resolve(buildVoteLaAttributes(input)),
    state: (seq) => buildVoteLaState(input, seq),
    startAlert: {
      title: LA_COPY.voteStartTitle,
      body: LA_COPY.voteStartBody,
      vars: { time: clockIn(poll.closes_at, rows[0]?.tz ?? 'UTC'), question },
    },
    endsAt: poll.closes_at,
    lingerMs: LINGER_MS,
    urgency: () => ROUTINE,
  };
};
