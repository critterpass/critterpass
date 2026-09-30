/**
 * The boarding screen's reading of an RSVP answer: a full trip comes back applied with
 * SEAT_CAP_REACHED and must show the waitlist place, never a boarded pass; an offline board is
 * pending; a refusal reverses the pass.
 */
import { describe, expect, it } from '@jest/globals';

import { boardOutcome, placeCode } from '../board/model';

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

describe('placeCode', () => {
  it('reads a board code from a place name', () => {
    expect(placeCode('Đà Nẵng')).toBe('DAN');
    expect(placeCode('Kyoto')).toBe('KYO');
  });
});
