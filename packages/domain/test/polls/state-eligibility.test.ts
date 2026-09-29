import { describe, expect, it } from 'vitest';

import {
  initialEligibleVoters,
  joinsOpenPoll,
  withVoterAdded,
  withVoterRemoved,
} from '../../src/polls/eligibility';
import { ballotSourceForVia, POLL_KINDS, POLL_STATUSES } from '../../src/polls/kinds';
import {
  assertPollOpen,
  canChangeStage,
  canTransitionPoll,
  initialStage,
} from '../../src/polls/state';

describe('poll state machine', () => {
  it('is born open and ends closed or cancelled for good', () => {
    expect(canTransitionPoll(null, 'open')).toBe(true);
    expect(canTransitionPoll(null, 'closed')).toBe(false);
    expect(canTransitionPoll('open', 'closed')).toBe(true);
    expect(canTransitionPoll('open', 'cancelled')).toBe(true);
    for (const from of ['closed', 'cancelled'] as const) {
      for (const to of POLL_STATUSES) expect(canTransitionPoll(from, to)).toBe(from === to);
    }
  });

  it('moves stages only on an open destination poll', () => {
    expect(canChangeStage('destination', 'open', 'board', 'final')).toBe(true);
    expect(canChangeStage('destination', 'open', 'final', 'board')).toBe(true);
    expect(canChangeStage('destination', 'closed', 'board', 'final')).toBe(false);
    expect(canChangeStage('generic', 'open', null, 'final')).toBe(false);
    for (const kind of POLL_KINDS) {
      expect(initialStage(kind)).toBe(kind === 'destination' ? 'board' : null);
    }
  });

  it('answers VOTE_CLOSED on anything but open', () => {
    expect(() => assertPollOpen('open')).not.toThrow();
    expect(() => assertPollOpen('closed')).toThrow(
      expect.objectContaining({ code: 'VOTE_CLOSED' }),
    );
  });
});

describe('eligibility', () => {
  const members = ['c', 'a', 'b'];
  it('gives the destination vote and crew polls to every active member', () => {
    expect(
      initialEligibleVoters({ kind: 'destination', tripId: 't', activeMemberIds: members }),
    ).toEqual(['a', 'b', 'c']);
    expect(
      initialEligibleVoters({ kind: 'generic', tripId: null, activeMemberIds: members }),
    ).toEqual(['a', 'b', 'c']);
  });

  it('gives other trip polls to seat holders who are still members, approvals to the affected', () => {
    expect(
      initialEligibleVoters({
        kind: 'day_option',
        tripId: 't',
        activeMemberIds: members,
        seatHolderIds: ['a', 'z'],
      }),
    ).toEqual(['a']);
    expect(
      initialEligibleVoters({
        kind: 'changeset_approval',
        tripId: 't',
        activeMemberIds: members,
        affectedUserIds: ['b', 'c', 'b'],
      }),
    ).toEqual(['b', 'c']);
  });

  it('adds a newcomer only to an open board, and removes a leaver', () => {
    expect(joinsOpenPoll('destination', 'board')).toBe(true);
    expect(joinsOpenPoll('destination', 'final')).toBe(false);
    expect(joinsOpenPoll('generic', null)).toBe(false);
    expect(withVoterAdded(['b'], 'a')).toEqual(['a', 'b']);
    expect(withVoterAdded(['a'], 'a')).toEqual(['a']);
    expect(withVoterRemoved(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('maps every surface to its ballot source', () => {
    expect(ballotSourceForVia('widget')).toBe('widget');
    expect(ballotSourceForVia('app_intent')).toBe('widget');
    expect(ballotSourceForVia('notif_action')).toBe('notification');
    expect(ballotSourceForVia('la_intent')).toBe('la');
    expect(ballotSourceForVia('offline')).toBe('app');
  });
});
