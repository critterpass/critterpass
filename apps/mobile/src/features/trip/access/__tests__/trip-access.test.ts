import { describe, expect, it } from '@jest/globals';

import { isTripId, tripAccess } from '../trip-access';

describe('what stands in a trip route’s first segment', () => {
  it('takes a trip id', () => {
    expect(isTripId('0192e1a2-0000-7000-8000-0000000000aa')).toBe(true);
    expect(isTripId('0192E1A2-0000-7000-8000-0000000000AA')).toBe(true);
  });

  it('takes nothing else: an unknown link is not a trip', () => {
    for (const segment of ['nowhere-at-all', 'trips', '', '0192e1a2', undefined, ['a', 'b']]) {
      expect(isTripId(segment)).toBe(false);
    }
  });
});

describe('whether a trip id has a trip this person can read', () => {
  it('opens a trip that is on the phone, heard from the server or not', () => {
    expect(tripAccess(true, false)).toBe('readable');
    expect(tripAccess(true, true)).toBe('readable');
  });

  it('calls a trip missing only once the server has answered without it', () => {
    expect(tripAccess(false, true)).toBe('missing');
  });

  it('keeps checking while the phone has not heard back (first sync, offline)', () => {
    expect(tripAccess(false, false)).toBe('checking');
    expect(tripAccess(null, false)).toBe('checking');
    expect(tripAccess(null, true)).toBe('checking');
  });
});
