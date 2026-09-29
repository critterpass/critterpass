import { describe, expect, it } from 'vitest';

import { computeTally, type TallyBallot } from '../../src/polls/tally';
import {
  majorityOriginOf,
  pickFinalists,
  pickWinner,
  type FrozenPrice,
} from '../../src/polls/tie-rules';

const options = [
  { id: 'kyoto', position: 0 },
  { id: 'lisbon', position: 1 },
  { id: 'bali', position: 2 },
];
const order = options.map((o) => o.id);
const b = (userId: string, optionId: string, t: number): TallyBallot => ({
  userId,
  optionId,
  castAt: new Date(t * 1000),
});
const tie = [b('a', 'lisbon', 1), b('b', 'kyoto', 2), b('c', 'kyoto', 3), b('d', 'lisbon', 4)];
const tally = (ballots: readonly TallyBallot[], voters = ['a', 'b', 'c', 'd', 'e', 'f']) =>
  computeTally({ options, eligibleVoterIds: voters, ballots });
const prices = new Map<string, FrozenPrice>([
  ['kyoto', { amountMinor: 41_200, currency: 'USD' }],
  ['lisbon', { amountMinor: 85_200, currency: 'USD' }],
]);

describe('pickWinner', () => {
  it('gives an outright leader the win without a tie note', () => {
    const ballots = [b('a', 'kyoto', 1), b('b', 'kyoto', 2), b('c', 'lisbon', 3)];
    expect(
      pickWinner({
        rule: 'cheaper_for_majority_origin',
        tally: tally(ballots),
        ballots,
        optionOrder: order,
      }),
    ).toEqual({ outcome: 'winner', winnerOptionId: 'kyoto', tie: null });
  });

  it('breaks a final tie on the frozen price for the majority origin', () => {
    const result = pickWinner({
      rule: 'cheaper_for_majority_origin',
      tally: tally(tie),
      ballots: tie,
      optionOrder: order,
      prices,
      majorityOrigin: { origin: 'SIN', memberCount: 4 },
    });
    expect(result).toEqual({
      outcome: 'winner',
      winnerOptionId: 'kyoto',
      tie: {
        rule: 'cheaper_for_majority_origin',
        winnerOptionId: 'kyoto',
        runnerUpOptionId: 'lisbon',
        origin: 'SIN',
        memberCount: 4,
        cheaperByMinor: 44_000,
        currency: 'USD',
      },
    });
  });

  it('falls back to the earliest to reach the count without comparable prices', () => {
    for (const bad of [
      new Map<string, FrozenPrice>([['kyoto', { amountMinor: 1, currency: 'USD' }]]),
      new Map<string, FrozenPrice>([
        ['kyoto', { amountMinor: 1, currency: 'USD' }],
        ['lisbon', { amountMinor: 2, currency: 'SGD' }],
      ]),
      new Map<string, FrozenPrice>([
        ['kyoto', { amountMinor: 5, currency: 'USD' }],
        ['lisbon', { amountMinor: 5, currency: 'USD' }],
      ]),
    ]) {
      const result = pickWinner({
        rule: 'cheaper_for_majority_origin',
        tally: tally(tie),
        ballots: tie,
        optionOrder: order,
        prices: bad,
        majorityOrigin: { origin: 'SIN', memberCount: 4 },
      });
      // Kyoto's second vote (t=3) came before Lisbon's (t=4).
      expect(result).toEqual({
        outcome: 'winner',
        winnerOptionId: 'kyoto',
        tie: { rule: 'earliest_to_count', winnerOptionId: 'kyoto' },
      });
    }
  });

  it('asks the organiser on an organiser_pick tie and honours only a tied pick', () => {
    const input = {
      rule: 'organiser_pick' as const,
      tally: tally(tie),
      ballots: tie,
      optionOrder: order,
    };
    expect(pickWinner(input)).toEqual({
      outcome: 'needs_pick',
      tiedOptionIds: ['kyoto', 'lisbon'],
    });
    expect(pickWinner({ ...input, pick: 'bali' })).toMatchObject({ outcome: 'needs_pick' });
    expect(pickWinner({ ...input, pick: 'lisbon' })).toMatchObject({ winnerOptionId: 'lisbon' });
  });

  it('closes an empty poll without a winner unless empty counts as a tie', () => {
    const input = {
      rule: 'cheaper_for_majority_origin' as const,
      tally: tally([]),
      ballots: [],
      optionOrder: order,
    };
    expect(pickWinner(input)).toEqual({ outcome: 'no_votes' });
    expect(
      pickWinner({
        ...input,
        emptyIsTie: true,
        prices: new Map([...prices, ['bali', { amountMinor: 1, currency: 'USD' }]]),
        majorityOrigin: { origin: 'SIN', memberCount: 2 },
      }),
    ).toMatchObject({ winnerOptionId: 'bali' });
  });
});

describe('pickFinalists', () => {
  it('takes the top two', () => {
    const ballots = [b('a', 'bali', 1), b('b', 'bali', 2), b('c', 'kyoto', 3)];
    expect(pickFinalists(tally(ballots), order)).toEqual({
      outcome: 'finalists',
      optionIds: ['bali', 'kyoto'],
    });
  });

  it('asks the organiser when the second spot is tied, then honours the pick', () => {
    const ballots = [b('a', 'bali', 1), b('b', 'bali', 2), b('c', 'kyoto', 3), b('d', 'lisbon', 4)];
    expect(pickFinalists(tally(ballots), order)).toEqual({
      outcome: 'needs_pick',
      tiedOptionIds: ['kyoto', 'lisbon'],
      settled: ['bali'],
    });
    expect(pickFinalists(tally(ballots), order, ['lisbon'])).toEqual({
      outcome: 'finalists',
      optionIds: ['bali', 'lisbon'],
    });
  });

  it('passes a two-way tie for first straight to the final, and needs two places', () => {
    const two = computeTally({
      options: options.slice(0, 2),
      eligibleVoterIds: ['a'],
      ballots: [],
    });
    expect(pickFinalists(two, order)).toEqual({
      outcome: 'finalists',
      optionIds: ['kyoto', 'lisbon'],
    });
    const one = computeTally({
      options: options.slice(0, 1),
      eligibleVoterIds: ['a'],
      ballots: [],
    });
    expect(pickFinalists(one, order)).toEqual({ outcome: 'too_few' });
  });
});

describe('majorityOriginOf', () => {
  it('counts known airports, ties to the alphabetically first', () => {
    expect(majorityOriginOf(['SIN', 'SGN', 'SIN', null])).toEqual({
      origin: 'SIN',
      memberCount: 2,
    });
    expect(majorityOriginOf(['SIN', 'BKK'])).toEqual({ origin: 'BKK', memberCount: 1 });
    expect(majorityOriginOf([null])).toBeNull();
  });
});
