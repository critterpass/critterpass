/**
 * One poll as every surface draws it, live from the local database. Its row, options, ballots and
 * this device's queued ballots are four reads that land one after another; the poll is given only
 * once all four have, so no surface draws it with the votes still missing (a final at 0–0, "you
 * missed this vote" for someone who voted).
 */
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
  const loaded = polls.loaded && options.loaded && ballots.loaded && pending.loaded;
  const poll = useMemo(() => {
    const row = polls.rows[0];
    if (!loaded || row === undefined || me === null) return null;
    return pollView(row, options.rows, ballots.rows, pending.rows, me, new Date(minute * 60_000));
  }, [loaded, polls.rows, options.rows, ballots.rows, pending.rows, me, minute]);
  return { poll, loaded };
}
