/**
 * Closing a poll, once, whichever door gets there first (the last ballot, the decider, the
 * organiser or the deadline job): the winner by votes and the poll's tie rule, the result stored
 * on the poll, and for the destination vote the trip's `voting → won` move, the winning place,
 * the loser pitches back in the deck and a pending reveal for every voter. The caller holds the
 * poll row lock (`loadPollState(..., 'update')`) and runs as `app_system`.
 */
import {
  cheaperForMajority,
  earliestToCount,
  majorityOriginOf,
  pickWinner,
  pollVoteResolveKey,
  POLL_REMINDERS,
  userChannel,
  tallyWire,
  type FrozenPrice,
  type MajorityOrigin,
  type PollCloseReason,
  type Tally,
  type TieBreak,
} from '@cp/domain';
import type pg from 'pg';

import { outbox } from '../command/outbox';
import { appendDomainEvent } from '../events';
import { cancelScheduledEvent } from '../jobs';
import { optionOrder, publishPollHints, tallyOf, type PollState } from './state';

export const POLL_CLOSE_QUEUE = 'poll.close';
export const POLL_REMIND_QUEUE = 'poll.remind';
export const POLL_BOARD_ADVANCE_QUEUE = 'poll.board_advance';

export interface ClosePollInput {
  readonly reason: PollCloseReason;
  readonly now: Date;
  /** Who closed it: the organiser, the last voter or `null` for the deadline job. */
  readonly actorId: string | null;
  /** The decider's verdict, when an approval closed early. */
  readonly deciderWinner?: string | null;
}

export type ClosePollResult =
  | { readonly outcome: 'already_closed'; readonly winnerOptionId: string | null }
  | {
      readonly outcome: 'closed';
      readonly winnerOptionId: string | null;
      readonly tie: TieBreak | null;
      readonly tally: Tally;
    };

export interface PricingFacts {
  readonly prices: ReadonlyMap<string, FrozenPrice>;
  readonly majorityOrigin: MajorityOrigin | null;
}

/** Frozen per-person prices of the live options and the voters' majority home airport. */
export async function loadPricingFacts(tx: pg.PoolClient, state: PollState): Promise<PricingFacts> {
  const quoteIds = state.options
    .filter((option) => option.eliminated_at === null && option.frozen_quote_id !== null)
    .map((option) => option.frozen_quote_id);
  const prices = new Map<string, FrozenPrice>();
  if (quoteIds.length > 0) {
    const { rows } = await tx.query<{ id: string; amount_minor: string; currency: string }>(
      'SELECT id, amount_minor, currency FROM price_quotes WHERE id = ANY ($1::uuid[])',
      [quoteIds],
    );
    const byQuote = new Map(rows.map((row) => [row.id, row]));
    for (const option of state.options) {
      const quote =
        option.frozen_quote_id === null ? undefined : byQuote.get(option.frozen_quote_id);
      if (quote !== undefined) {
        prices.set(option.id, {
          amountMinor: Number(quote.amount_minor),
          currency: quote.currency,
        });
      }
    }
  }
  const { rows } = await tx.query<{ home_airport: string | null }>(
    'SELECT home_airport FROM users WHERE id = ANY ($1::uuid[])',
    [state.poll.eligible_voter_ids],
  );
  return { prices, majorityOrigin: majorityOriginOf(rows.map((row) => row.home_airport)) };
}

export function tieWire(tie: TieBreak | null): Record<string, unknown> | null {
  if (tie === null) return null;
  if (tie.rule !== 'cheaper_for_majority_origin') {
    return { rule: tie.rule, winner_option_id: tie.winnerOptionId };
  }
  return {
    rule: tie.rule,
    winner_option_id: tie.winnerOptionId,
    runner_up_option_id: tie.runnerUpOptionId,
    origin: tie.origin,
    member_count: tie.memberCount,
    cheaper_by_minor: tie.cheaperByMinor,
    currency: tie.currency,
  };
}

/** Which of the two finalists a tie would go to, for the final's "A tie goes to …" line. */
export async function tiePreview(
  tx: pg.PoolClient,
  state: PollState,
): Promise<Record<string, unknown> | null> {
  const facts = await loadPricingFacts(tx, state);
  const tally = tallyOf(state);
  const tied = optionOrder(state);
  const cheaper = cheaperForMajority(
    {
      rule: 'cheaper_for_majority_origin',
      tally,
      ballots: [],
      optionOrder: tied,
      prices: facts.prices,
      majorityOrigin: facts.majorityOrigin,
    },
    tied,
  );
  return tieWire(cheaper);
}

async function cancelTimers(tx: pg.PoolClient, pollId: string): Promise<void> {
  await cancelScheduledEvent(tx, { kind: POLL_CLOSE_QUEUE, refId: pollId });
  await cancelScheduledEvent(tx, { kind: POLL_BOARD_ADVANCE_QUEUE, refId: pollId });
  for (const reminder of POLL_REMINDERS) {
    await cancelScheduledEvent(tx, { kind: POLL_REMIND_QUEUE, refId: pollId, slot: reminder.slot });
  }
}

function decideWinner(
  state: PollState,
  tally: Tally,
  facts: PricingFacts,
  input: ClosePollInput,
): { winnerOptionId: string | null; tie: TieBreak | null } {
  if (input.deciderWinner !== undefined && input.deciderWinner !== null) {
    return { winnerOptionId: input.deciderWinner, tie: null };
  }
  const ballots = state.ballots.map((b) => ({
    optionId: b.option_id,
    userId: b.user_id,
    castAt: b.cast_at,
  }));
  const tieInput = {
    rule: state.poll.tie_rule,
    tally,
    ballots,
    optionOrder: optionOrder(state),
    prices: facts.prices,
    majorityOrigin: facts.majorityOrigin,
    emptyIsTie: state.poll.kind === 'destination',
  };
  const picked = pickWinner(tieInput);
  if (picked.outcome === 'winner')
    return { winnerOptionId: picked.winnerOptionId, tie: picked.tie };
  if (picked.outcome === 'no_votes') return { winnerOptionId: null, tie: null };
  // Nobody left to pick (the deadline reached an organiser_pick tie): earliest to count decides.
  const winner = earliestToCount(tieInput, picked.tiedOptionIds);
  return { winnerOptionId: winner, tie: { rule: 'earliest_to_count', winnerOptionId: winner } };
}

async function settleDestination(
  tx: pg.PoolClient,
  state: PollState,
  winnerOptionId: string | null,
  input: ClosePollInput,
): Promise<void> {
  const { poll } = state;
  const winner = state.options.find((option) => option.id === winnerOptionId);
  const live = state.options.filter((option) => option.eliminated_at === null);
  for (const option of live) {
    if (option.pitch_id === null) continue;
    await tx.query('UPDATE pitches SET status = $2 WHERE id = $1', [
      option.pitch_id,
      option.id === winnerOptionId ? 'won' : 'back_in_deck',
    ]);
  }
  await tx.query(
    `INSERT INTO poll_reveals (poll_id, user_id)
     SELECT $1, uid FROM unnest($2::uuid[]) AS uid
     ON CONFLICT (poll_id, user_id) DO NOTHING`,
    [poll.id, poll.eligible_voter_ids],
  );
  if (poll.trip_id === null || winner?.ref_id === null || winner === undefined) return;
  const { rows } = await tx.query<{ status: string }>(
    `UPDATE trips t
        SET status = 'won', destination_id = $2,
            guide_id = coalesce(app.destination_guide_id($2), t.guide_id),
            is_guest_guide = (SELECT d.coverage = 'guest' FROM destinations d WHERE d.id = $2)
      WHERE t.id = $1 AND t.status = 'voting'
      RETURNING status`,
    [poll.trip_id, winner.ref_id],
  );
  if (rows.length === 0) return;
  const actor =
    input.actorId === null
      ? { actorKind: 'system' as const, actorId: null }
      : { actorKind: 'user' as const, actorId: input.actorId };
  await appendDomainEvent(tx, {
    type: 'trip.status_changed',
    aggregateKind: 'trip',
    aggregateId: poll.trip_id,
    ...actor,
    payload: { trip_id: poll.trip_id, from: 'voting', to: 'won' },
    crewId: poll.crew_id,
    tripId: poll.trip_id,
  });
  await appendDomainEvent(tx, {
    type: 'trip.destination_set',
    aggregateKind: 'trip',
    aggregateId: poll.trip_id,
    ...actor,
    payload: { trip_id: poll.trip_id, destination_id: winner.ref_id },
    crewId: poll.crew_id,
    tripId: poll.trip_id,
  });
}

/** Settles every voter's open "vote needed" card for the poll and refreshes their badges. */
async function settleVoteCards(tx: pg.PoolClient, state: PollState, now: Date): Promise<void> {
  const keys = state.poll.eligible_voter_ids.map((uid) => pollVoteResolveKey(uid, state.poll.id));
  if (keys.length === 0) return;
  const { rows } = await tx.query<{ user_id: string }>(
    'SELECT DISTINCT user_id FROM app.resolve_inbox_items($1::text[], $2)',
    [keys, now],
  );
  for (const { user_id: uid } of rows) {
    const counts = await tx.query<{ needs_you: number; unread: number }>(
      'SELECT needs_you, unread FROM app.inbox_badge_counts($1, $2)',
      [uid, now],
    );
    await outbox(
      tx,
      userChannel(uid),
      'badge.counts',
      counts.rows[0] ?? { needs_you: 0, unread: 0 },
    );
  }
}

export async function closePollInTx(
  tx: pg.PoolClient,
  state: PollState,
  input: ClosePollInput,
): Promise<ClosePollResult> {
  const { poll } = state;
  if (poll.status !== 'open')
    return { outcome: 'already_closed', winnerOptionId: poll.winner_option_id };
  const tally = tallyOf(state);
  const facts =
    poll.tie_rule === 'cheaper_for_majority_origin'
      ? await loadPricingFacts(tx, state)
      : { prices: new Map<string, FrozenPrice>(), majorityOrigin: null };
  const { winnerOptionId, tie } = decideWinner(state, tally, facts, input);
  const result = { ...tallyWire(tally), winner_option_id: winnerOptionId, tie: tieWire(tie) };
  await tx.query(
    `UPDATE polls SET status = 'closed', winner_option_id = $2, closed_at = $3, close_reason = $4,
            result = coalesce(result, '{}'::jsonb) || $5::jsonb, version = version + 1
      WHERE id = $1`,
    [poll.id, winnerOptionId, input.now, input.reason, JSON.stringify(result)],
  );
  await cancelTimers(tx, poll.id);
  await settleVoteCards(tx, state, input.now);
  if (poll.kind === 'destination') await settleDestination(tx, state, winnerOptionId, input);
  await appendDomainEvent(tx, {
    type: 'poll.closed',
    aggregateKind: 'poll',
    aggregateId: poll.id,
    actorKind: input.actorId === null ? 'system' : 'user',
    actorId: input.actorId,
    payload: {
      poll_id: poll.id,
      crew_id: poll.crew_id,
      trip_id: poll.trip_id,
      kind: poll.kind,
      winner_option_id: winnerOptionId,
      reason: input.reason,
      tie_broken: tie !== null,
    },
    crewId: poll.crew_id,
    ...(poll.trip_id === null ? {} : { tripId: poll.trip_id }),
  });
  await publishPollHints(tx, state, tally, 'poll.closed', { winner_option_id: winnerOptionId });
  return { outcome: 'closed', winnerOptionId, tie, tally };
}
