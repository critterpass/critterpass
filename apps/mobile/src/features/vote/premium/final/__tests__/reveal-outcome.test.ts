import type { PollOptionView, PollView } from '../../../data/poll-view';
import { revealOutcome } from '../reveal-outcome';

function option(id: string, votes: number, winner = false): PollOptionView {
  return {
    id,
    label: id,
    refId: null,
    pitchId: null,
    proposedBy: null,
    votes,
    voterIds: [],
    mine: false,
    winner,
  };
}

function poll(overrides: Partial<PollView>): PollView {
  return {
    id: 'p',
    crewId: 'c',
    tripId: 't',
    kind: 'destination',
    stage: 'final',
    status: 'closed',
    question: null,
    createdBy: null,
    options: [option('kyoto', 4, true), option('lisbon', 2)],
    myOptionId: null,
    myVoteQueued: false,
    eligibleIds: ['me', 'a'],
    pendingIds: [],
    votedCount: 6,
    canVote: false,
    allowChange: true,
    closesAt: null,
    winnerOptionId: 'kyoto',
    tiePreview: null,
    tieBreak: null,
    ...overrides,
  } as PollView;
}

describe('revealOutcome', () => {
  it('has no outcome before a winner is set', () => {
    expect(
      revealOutcome(poll({ options: [option('kyoto', 1), option('lisbon', 1)] }), 'me'),
    ).toBeNull();
  });

  it('tells a viewer who backed the losing place that their pick lost', () => {
    const outcome = revealOutcome(poll({ myOptionId: 'lisbon' }), 'me');
    expect(outcome?.lost).toBe(true);
    expect(outcome?.missed).toBe(false);
    expect(outcome?.loser?.id).toBe('lisbon');
  });

  it('tells an eligible viewer who never voted that they missed it', () => {
    expect(revealOutcome(poll({}), 'me')?.missed).toBe(true);
    expect(revealOutcome(poll({}), 'not-eligible')?.missed).toBe(false);
  });

  it('treats a place locked in with no votes as neither missed nor scored', () => {
    const outcome = revealOutcome(
      poll({ votedCount: 0, options: [option('kyoto', 0, true), option('lisbon', 0)] }),
      'me',
    );
    expect(outcome?.lockedIn).toBe(true);
    expect(outcome?.missed).toBe(false);
    expect(outcome?.share.get('kyoto')).toBe(0);
  });

  it('gives each place its share of the votes for the tally bars', () => {
    const outcome = revealOutcome(poll({}), 'me');
    expect(outcome?.share.get('kyoto')).toBeCloseTo(4 / 6);
    expect(outcome?.share.get('lisbon')).toBeCloseTo(2 / 6);
  });
});
