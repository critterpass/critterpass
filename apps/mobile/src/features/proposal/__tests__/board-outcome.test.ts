/**
 * The boarding screen's reading of an RSVP answer: a full trip comes back applied with
 * SEAT_CAP_REACHED and must show the waitlist place, never a boarded pass; an offline board is
 * pending; a refusal reverses the pass.
 */
import { describe, expect, it } from '@jest/globals';

import { arrivalCode, boardOutcome } from '../board/model';

describe('boardOutcome', () => {
  it('boards on a plain IN', () => {
    expect(
      boardOutcome({ kind: 'applied', opId: 'a', result: { rsvp: 'in', waitlisted: false } }),
    ).toEqual({ kind: 'boarded' });
  });

  it('shows the waitlist place when the trip is full', () => {
    expect(
      boardOutcome({
        kind: 'applied',
        opId: 'a',
        result: {
          rsvp: 'waitlisted',
          waitlisted: true,
          code: 'SEAT_CAP_REACHED',
          waitlist_position: 2,
          cap: 6,
          boost_active: false,
        },
      }),
    ).toEqual({ kind: 'waitlisted', position: 2, cap: 6, boostActive: false });
  });

  it('is pending while queued offline and refused on a rejection', () => {
    expect(boardOutcome({ kind: 'queued', opId: 'a' })).toEqual({ kind: 'pending' });
    expect(boardOutcome({ kind: 'rejected', opId: 'a', code: 'NOT_ELIGIBLE' })).toEqual({
      kind: 'refused',
      code: 'NOT_ELIGIBLE',
    });
    expect(boardOutcome({ kind: 'unavailable', opId: 'a', code: 'HTTP_503' })).toEqual({
      kind: 'unreachable',
    });
  });

  it('keeps MAYBE and OUT answers apart from boarding', () => {
    expect(
      boardOutcome({ kind: 'applied', opId: 'a', result: { rsvp: 'maybe', waitlisted: false } }),
    ).toEqual({ kind: 'answered', status: 'maybe' });
  });
});

describe('arrivalCode', () => {
  it('takes the destination’s primary airport, never a code made from the name', () => {
    expect(arrivalCode('da-nang', 'Đà Nẵng')).toBe('DAD');
    expect(arrivalCode('nowhere-on-file', 'Hội An')).toBe('Hội An');
    expect(arrivalCode(null, 'Hội An')).toBe('Hội An');
  });
});
