/**
 * The tracker shows public statuses only (an open reads as no reply) and offers the lock only
 * for a sent proposal with at least one recipient IN; the organiser counts as IN.
 */
import { describe, expect, it } from '@jest/globals';

import type { CrewPerson, RsvpStatus } from '../data/trip';
import { lockState, publicStatus, tally } from '../tracker/model';

const person = (uid: string, rsvp: RsvpStatus, organiser = false): CrewPerson => ({
  uid,
  name: uid,
  fullName: uid,
  joinIndex: 0,
  organiser,
  rsvp,
  repliedAt: null,
});

describe('tracker model', () => {
  it('lets the organiser lock in alone only once every recipient is out', () => {
    expect(lockState('sent', [person('a', 'out'), person('b', 'out')])).toEqual({ kind: 'alone' });
    expect(lockState('sent', [person('a', 'out'), person('b', 'maybe')])).toEqual({
      kind: 'nobody_in',
    });
    expect(lockState('sent', [person('a', 'out'), person('b', 'unopened')])).toEqual({
      kind: 'nobody_in',
    });
    expect(lockState('sent', [])).toEqual({ kind: 'nobody_in' });
  });

  it('never shows an open: opened reads as no reply', () => {
    expect(publicStatus(person('a', 'opened'))).toBe('no_reply');
    expect(publicStatus(person('a', 'unopened'))).toBe('no_reply');
  });

  it('counts the organiser as in', () => {
    const counts = tally([
      person('o', 'in', true),
      person('a', 'in'),
      person('b', 'maybe'),
      person('c', 'opened'),
    ]);
    expect(counts).toEqual({ in: 2, maybe: 1, noReply: 1, out: 0, waitlisted: 0 });
  });

  it('offers the lock only once a recipient is in on a sent proposal', () => {
    const waiting = [person('a', 'maybe'), person('b', 'unopened')];
    expect(lockState('sent', waiting)).toEqual({ kind: 'nobody_in' });
    expect(lockState('building', [person('a', 'in')])).toEqual({ kind: 'not_sent' });
    expect(lockState('locked', [person('a', 'in')])).toEqual({ kind: 'locked' });
    expect(lockState('sent', [person('a', 'in'), ...waiting])).toEqual({
      kind: 'ready',
      going: 1,
      maybes: 1,
      silent: 1,
    });
  });
});
