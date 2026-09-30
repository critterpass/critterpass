import { clampClosesAt, type ChangeSetOp, type PollDeciderPolicy } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  chooseDeciderPolicy,
  verdict,
  verdictAtExpiry,
  type VoteFacts,
} from '../../src/plan/decider-policy';

const [org, a, b, c] = ['org', 'a', 'b', 'c'] as const;
const NOW = new Date('2027-04-01T00:00:00Z');

const facts = (
  policy: PollDeciderPolicy,
  yes: string[],
  no: string[],
  extra: Partial<VoteFacts> = {},
): VoteFacts => ({
  policy,
  threshold: policy === 'threshold_n' ? 2 : null,
  eligible: [org, a, b, c],
  yes,
  no,
  organiserIds: [org],
  ...extra,
});

// Four voters (the organiser among them) under each policy: the ballots that approve, reject,
// split evenly with everyone voted (a tie), and leave the vote undecided at its deadline.
const TABLE: ReadonlyArray<
  [PollDeciderPolicy, 'approve' | 'reject' | 'tie' | 'expiry', string[], string[], string]
> = [
  ['organiser', 'approve', [org], [], 'approve'],
  ['organiser', 'reject', [a, b], [org], 'reject'],
  ['organiser', 'tie', [a, b], [c], 'pending'],
  ['organiser', 'expiry', [a], [], 'expired'],
  ['any_affected', 'approve', [c], [], 'approve'],
  ['any_affected', 'reject', [], [org, a, b, c], 'reject'],
  ['any_affected', 'tie', [], [a, b], 'pending'],
  ['any_affected', 'expiry', [], [a], 'expired'],
  ['majority_of_affected', 'approve', [a, b, c], [], 'approve'],
  ['majority_of_affected', 'reject', [a], [b, c, org], 'reject'],
  ['majority_of_affected', 'tie', [org, a], [b, c], 'approve'],
  ['majority_of_affected', 'expiry', [a], [b], 'expired'],
  ['threshold_n', 'approve', [a, b], [], 'approve'],
  ['threshold_n', 'reject', [a], [b, c, org], 'reject'],
  ['threshold_n', 'tie', [a], [b], 'pending'],
  ['threshold_n', 'expiry', [], [], 'expired'],
];

describe('change set decider', () => {
  it.each(TABLE)('%s × %s', (policy, scenario, yes, no, expected) => {
    const vote = facts(policy, yes, no);
    const got = scenario === 'expiry' ? verdictAtExpiry(vote) : verdict(vote);
    expect(got).toBe(expected);
  });

  it('leaves an even split without an organiser ballot to the organiser, and keeps the plan at expiry', () => {
    const split = facts('majority_of_affected', [a, b], [c, 'd'], { eligible: [a, b, c, 'd'] });
    expect(verdict(split)).toBe('tie');
    expect(verdict({ ...split, tieBreak: 'no' })).toBe('reject');
    expect(verdict({ ...split, tieBreak: 'yes' })).toBe('approve');
    expect(verdictAtExpiry(split)).toBe('expired');
  });
});

const op = (affected: string[], bookingImpact = false): ChangeSetOp => ({
  op: 'retime',
  target: '0195f000-0000-7000-8000-000000000001',
  reason: 'rain',
  affected_user_ids: affected,
  booking_impact: bookingImpact,
});

describe('default decider policy', () => {
  const base = {
    authorId: a,
    costDeltaMinor: 0,
    inTrip: false,
    now: NOW,
    itemStarts: [],
    holdExpiry: null,
  };

  it('applies a change that touches only its author at once', () => {
    expect(chooseDeciderPolicy({ ...base, ops: [op([a])], affectedUserIds: [a] })).toEqual({
      policy: 'self',
    });
  });

  it('asks a majority of the affected when others or money are involved', () => {
    const others = chooseDeciderPolicy({
      ...base,
      ops: [op([a, b, c])],
      affectedUserIds: [a, b, c],
    });
    expect(others).toMatchObject({ policy: 'majority_of_affected', affectedUserIds: [a, b, c] });
    const money = chooseDeciderPolicy({ ...base, ops: [op([a], true)], affectedUserIds: [a, b] });
    expect(money.policy).toBe('majority_of_affected');
  });

  it('takes any affected yes for a time-critical in-trip change', () => {
    const soon = new Date(NOW.getTime() + 3_600_000);
    const choice = chooseDeciderPolicy({
      ...base,
      inTrip: true,
      itemStarts: [soon],
      ops: [op([a, b])],
      affectedUserIds: [a, b],
    });
    expect(choice).toMatchObject({ policy: 'any_affected' });
    expect(choice.policy !== 'self' && choice.closesAt.getTime()).toBe(soon.getTime());
  });

  it('closes the vote no later than the earliest hold, and leaves the default without one', () => {
    const hold = new Date(NOW.getTime() + 2 * 3_600_000);
    const held = chooseDeciderPolicy({
      ...base,
      holdExpiry: hold,
      ops: [op([a, b])],
      affectedUserIds: [a, b],
    });
    const free = chooseDeciderPolicy({ ...base, ops: [op([a, b])], affectedUserIds: [a, b] });
    expect(held.policy !== 'self' && held.closesAt.getTime()).toBeLessThanOrEqual(hold.getTime());
    expect(free.policy !== 'self' && free.closesAt.getTime()).toBe(NOW.getTime() + 86_400_000);
    expect(clampClosesAt(hold, null)).toBe(hold);
  });
});
