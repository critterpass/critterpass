/**
 * Whose turn it is, by role and trip status: the organiser drafts, sends and locks; a member
 * waits for the plan, answers, then waits for the lock. Home and the hub both read this.
 */
import { describe, expect, it } from '@jest/globals';

import { isLockedIn, tripTurn, type TurnInput } from '../turn/model';

const base: TurnInput = {
  status: 'draft_review',
  role: 'organiser',
  crewSize: 1,
  proposal: null,
  myRsvp: 'in',
  recipients: [],
};
const sent = { status: 'sent', replyBy: '2026-10-05T10:00:00Z' };

describe('the organiser', () => {
  it('waits while the guide drafts, with the wait one tap away', () => {
    expect(tripTurn({ ...base, status: 'drafting' })).toEqual({
      turn: { kind: 'guide_drafting' },
      mine: false,
      target: 'drafting',
    });
    expect(tripTurn({ ...base, status: 'redrafting' }).target).toBe('draft');
  });

  it('finishes her draft alone, and sends it once a friend is in the crew', () => {
    expect(tripTurn(base)).toEqual({ turn: { kind: 'finish_draft' }, mine: true, target: 'draft' });
    expect(tripTurn({ ...base, crewSize: 3 })).toEqual({
      turn: { kind: 'send_plan', waiting: 2 },
      mine: true,
      target: 'draft',
    });
  });

  it('goes back to the proposal she was building', () => {
    const building = { status: 'building', replyBy: null };
    expect(tripTurn({ ...base, crewSize: 2, proposal: building }).target).toBe('builder');
  });

  it('waits for answers until everyone has replied, then locks', () => {
    const waiting = tripTurn({
      ...base,
      status: 'proposed',
      crewSize: 3,
      proposal: sent,
      recipients: [{ rsvp: 'in' }, { rsvp: 'opened' }],
    });
    expect(waiting).toEqual({
      turn: { kind: 'waiting_for_answers', answered: 1, total: 2, replyBy: sent.replyBy },
      mine: false,
      target: 'tracker',
    });
    const ready = tripTurn({
      ...base,
      status: 'proposed',
      crewSize: 3,
      proposal: sent,
      recipients: [{ rsvp: 'in' }, { rsvp: 'maybe' }],
    });
    expect(ready).toEqual({
      turn: { kind: 'lock', going: 2, crew: 3 },
      mine: true,
      target: 'tracker',
    });
  });

  it('cannot lock with nobody in, unless everyone said they are out', () => {
    const maybes = {
      ...base,
      status: 'proposed',
      proposal: sent,
      recipients: [{ rsvp: 'maybe' as const }],
    };
    expect(tripTurn(maybes).turn.kind).toBe('waiting_for_answers');
    const allOut = { ...maybes, recipients: [{ rsvp: 'out' as const }, { rsvp: 'out' as const }] };
    expect(tripTurn(allOut).turn).toEqual({ kind: 'lock', going: 1, crew: 3 });
  });
});

describe('a member', () => {
  const member: TurnInput = { ...base, role: 'member', crewSize: 2, myRsvp: null };

  it.each(['drafting', 'redrafting', 'draft_review'])(
    'is told the plan is coming while the trip is %s, with no button',
    (status) => {
      expect(tripTurn({ ...member, status })).toEqual({
        turn: { kind: 'plan_coming' },
        mine: false,
        target: null,
      });
    },
  );

  it('is asked to answer a sent plan until they do', () => {
    const waiting = { ...member, status: 'proposed', proposal: sent };
    expect(tripTurn({ ...waiting, myRsvp: 'opened' })).toEqual({
      turn: { kind: 'answer', replyBy: sent.replyBy },
      mine: true,
      target: 'proposal',
    });
    expect(tripTurn({ ...waiting, myRsvp: null }).turn.kind).toBe('answer');
    expect(tripTurn({ ...waiting, myRsvp: 'maybe' })).toEqual({
      turn: { kind: 'answered', answer: 'maybe', replyBy: sent.replyBy },
      mine: false,
      target: 'proposal',
    });
  });
});

describe('everyone', () => {
  it('sets the trip up before any draft', () => {
    expect(tripTurn({ ...base, status: 'setup', role: 'member' }).turn.kind).toBe('setup');
    expect(tripTurn({ ...base, status: 'voting' }).turn.kind).toBe('vote');
  });

  it('is asked for a yes when a crewmate’s plan change waits on a locked trip', () => {
    expect(tripTurn({ ...base, status: 'pre_trip', planVote: { by: 'Minh' } })).toEqual({
      turn: { kind: 'plan_vote', by: 'Minh' },
      mine: true,
      target: 'review',
    });
    // Before the lock the trip's own step comes first.
    expect(tripTurn({ ...base, planVote: { by: 'Minh' } }).turn.kind).toBe('finish_draft');
  });

  it('reads locked once the trip is confirmed, and only then', () => {
    expect(tripTurn({ ...base, status: 'confirmed' }).turn.kind).toBe('locked');
    expect(tripTurn({ ...base, status: 'cancelled' }).turn.kind).toBe('none');
    expect(isLockedIn('proposed')).toBe(false);
    expect(isLockedIn('pre_trip')).toBe(true);
  });
});
