import { describe, expect, it } from 'vitest';

import { approvalsNeeded, evaluateDecider } from '../../src/polls/decider';
import { computeTally } from '../../src/polls/tally';

const options = [
  { id: 'yes', position: 0 },
  { id: 'no', position: 1 },
];
function tally(voters: readonly string[], votes: Readonly<Record<string, 'yes' | 'no'>>) {
  return computeTally({
    options,
    eligibleVoterIds: voters,
    ballots: Object.entries(votes).map(([userId, optionId], i) => ({
      userId,
      optionId,
      castAt: new Date(1_000 + i),
    })),
  });
}
const five = ['a', 'b', 'c', 'd', 'e'];
const base = { approveOptionId: 'yes', organiserIds: ['a'], threshold: null };

describe('evaluateDecider', () => {
  it.each([
    ['organiser', 5, null, 1],
    ['any_affected', 5, null, 1],
    ['majority_of_affected', 5, null, 3],
    ['majority_of_affected', 4, null, 3],
    ['threshold_n', 5, 2, 2],
    ['threshold_n', 2, 4, 2],
  ] as const)('%s among %i with threshold %s needs %i', (policy, n, threshold, needed) => {
    expect(approvalsNeeded(policy, n, threshold)).toBe(needed);
  });

  it('plurality waits for everyone', () => {
    expect(evaluateDecider({ ...base, policy: null, tally: tally(five, { a: 'yes' }) })).toEqual({
      decided: false,
    });
    const all = tally(['a', 'b'], { a: 'yes', b: 'no' });
    expect(evaluateDecider({ ...base, policy: null, tally: all })).toEqual({
      decided: true,
      winnerOptionId: null,
      reason: 'all_voted',
    });
  });

  it('organiser: the first organiser ballot decides, a member ballot does not', () => {
    expect(
      evaluateDecider({ ...base, policy: 'organiser', tally: tally(five, { b: 'yes' }) }),
    ).toEqual({
      decided: false,
    });
    expect(
      evaluateDecider({ ...base, policy: 'organiser', tally: tally(five, { b: 'yes', a: 'no' }) }),
    ).toMatchObject({ decided: true, winnerOptionId: 'no' });
  });

  it('any_affected: one yes approves, all no rejects', () => {
    expect(
      evaluateDecider({ ...base, policy: 'any_affected', tally: tally(five, { c: 'yes' }) }),
    ).toMatchObject({
      winnerOptionId: 'yes',
    });
    expect(
      evaluateDecider({ ...base, policy: 'any_affected', tally: tally(['a', 'b'], { a: 'no' }) }),
    ).toEqual({ decided: false });
    expect(
      evaluateDecider({
        ...base,
        policy: 'any_affected',
        tally: tally(['a', 'b'], { a: 'no', b: 'no' }),
      }),
    ).toMatchObject({ winnerOptionId: 'no' });
  });

  it('majority_of_affected: decides as soon as either side is certain', () => {
    const policy = 'majority_of_affected' as const;
    expect(
      evaluateDecider({ ...base, policy, tally: tally(five, { a: 'yes', b: 'yes' }) }),
    ).toEqual({
      decided: false,
    });
    expect(
      evaluateDecider({ ...base, policy, tally: tally(five, { a: 'yes', b: 'yes', c: 'yes' }) }),
    ).toMatchObject({ winnerOptionId: 'yes' });
    expect(
      evaluateDecider({ ...base, policy, tally: tally(five, { a: 'no', b: 'no', c: 'no' }) }),
    ).toMatchObject({ winnerOptionId: 'no' });
  });

  it('threshold_n: n approvals, or reject once n is out of reach; a leaver shrinks the pool', () => {
    const policy = 'threshold_n' as const;
    expect(
      evaluateDecider({
        ...base,
        policy,
        threshold: 2,
        tally: tally(five, { a: 'yes', b: 'yes' }),
      }),
    ).toMatchObject({ winnerOptionId: 'yes' });
    expect(
      evaluateDecider({
        ...base,
        policy,
        threshold: 3,
        tally: tally(['a', 'b', 'c'], { a: 'no' }),
      }),
    ).toMatchObject({ winnerOptionId: 'no' });
    // d left: their yes no longer counts, and 3 of the remaining 4 can still approve.
    expect(
      evaluateDecider({
        ...base,
        policy,
        threshold: 3,
        tally: tally(['a', 'b', 'c', 'e'], { d: 'yes', a: 'yes' }),
      }),
    ).toEqual({ decided: false });
  });
});
