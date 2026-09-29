import { describe, expect, it } from 'vitest';

import { computeTally, soleLeader, tallyWire, type TallyBallot } from '../../src/polls/tally';

const T0 = new Date('2026-10-01T00:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const options = [
  { id: 'kyoto', position: 0 },
  { id: 'lisbon', position: 1 },
  { id: 'bali', position: 2, eliminated: true },
];
const ballot = (userId: string, optionId: string, minute: number): TallyBallot => ({
  userId,
  optionId,
  castAt: at(minute),
});

describe('computeTally', () => {
  it('counts eligible voters on live options, in cast order', () => {
    const tally = computeTally({
      options,
      eligibleVoterIds: ['a', 'b', 'c', 'd'],
      ballots: [ballot('b', 'kyoto', 2), ballot('a', 'kyoto', 1), ballot('c', 'lisbon', 3)],
    });
    expect(tally.options).toEqual([
      { optionId: 'kyoto', count: 2, voterIds: ['a', 'b'] },
      { optionId: 'lisbon', count: 1, voterIds: ['c'] },
    ]);
    expect(tally.total).toBe(3);
    expect(tally.pendingVoterIds).toEqual(['d']);
    expect(tally.leaderIds).toEqual(['kyoto']);
    expect(soleLeader(tally)).toBe('kyoto');
    expect(tally.allVoted).toBe(false);
  });

  it('ignores a voter who left and a ballot on an eliminated option', () => {
    const tally = computeTally({
      options,
      eligibleVoterIds: ['a', 'b'],
      ballots: [ballot('a', 'kyoto', 1), ballot('gone', 'lisbon', 2), ballot('b', 'bali', 3)],
    });
    expect(tally.total).toBe(1);
    expect(tally.eligibleCount).toBe(2);
    expect(tally.pendingVoterIds).toEqual(['b']);
  });

  it('reports a tie and nobody-voted', () => {
    const tie = computeTally({
      options,
      eligibleVoterIds: ['a', 'b'],
      ballots: [ballot('a', 'kyoto', 1), ballot('b', 'lisbon', 2)],
    });
    expect(tie.leaderIds).toEqual(['kyoto', 'lisbon']);
    expect(soleLeader(tie)).toBeNull();
    expect(tie.allVoted).toBe(true);
    const empty = computeTally({ options, eligibleVoterIds: ['a'], ballots: [] });
    expect(empty.leaderIds).toEqual([]);
    expect(tallyWire(empty)).toEqual({
      option_tallies: { kyoto: 0, lisbon: 0 },
      pending_count: 1,
      eligible_count: 1,
    });
  });

  it('never calls an empty electorate all-voted', () => {
    expect(computeTally({ options, eligibleVoterIds: [], ballots: [] }).allVoted).toBe(false);
  });
});
