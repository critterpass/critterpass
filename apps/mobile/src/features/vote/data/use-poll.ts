/** One poll as every surface draws it, live from the local database. */
import { useMemo } from 'react';

import { useLiveRows } from './live-rows';
import {
  BALLOTS_SQL,
  OPTIONS_SQL,
  PENDING_BALLOTS_SQL,
  POLL_SQL,
  POLL_TABLES,
} from './poll-queries';
import {
  pollView,
  type BallotRow,
  type OptionRow,
  type PendingBallot,
  type PollRow,
  type PollView,
} from './poll-view';

export interface UsePoll {
  readonly poll: PollView | null;
  readonly loaded: boolean;
}

export function usePoll(pollId: string | null, me: string | null, now: Date = new Date()): UsePoll {
  const params = pollId === null ? null : [pollId];
  const polls = useLiveRows<PollRow>(POLL_SQL, params, POLL_TABLES);
  const options = useLiveRows<OptionRow>(OPTIONS_SQL, params, POLL_TABLES);
  const ballots = useLiveRows<BallotRow>(BALLOTS_SQL, params, POLL_TABLES);
  const pending = useLiveRows<PendingBallot>(PENDING_BALLOTS_SQL, params, POLL_TABLES);
  const minute = Math.floor(now.getTime() / 60_000);
  const poll = useMemo(() => {
    const row = polls.rows[0];
    if (row === undefined || me === null) return null;
    return pollView(row, options.rows, ballots.rows, pending.rows, me, new Date(minute * 60_000));
  }, [polls.rows, options.rows, ballots.rows, pending.rows, me, minute]);
  return {
    poll,
    loaded: polls.loaded && options.loaded && ballots.loaded && pending.loaded,
  };
}
