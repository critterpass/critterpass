/**
 * The stop sheet's cost line: a price when one is known, "Free" only when the place is known to
 * be free, "No estimate yet" for a place nobody has priced, nothing for a bare note.
 */
import { describe, expect, it } from '@jest/globals';

import { costKind } from '../item-facts';

describe('what a stop’s cost line says', () => {
  it('never calls an unpriced place free', () => {
    expect(costKind(0, null, true)).toBe('unknown');
    expect(costKind(null, null, true)).toBe('unknown');
    expect(costKind(0, 2, true)).toBe('unknown');
  });

  it('says free only for a place known to be free, and a price when there is one', () => {
    expect(costKind(0, 0, true)).toBe('free');
    expect(costKind(null, 0, true)).toBe('free');
    expect(costKind(250_000, 0, true)).toBe('priced');
  });

  it('says nothing for a note with no place and no price', () => {
    expect(costKind(null, null, false)).toBe('none');
  });
});
