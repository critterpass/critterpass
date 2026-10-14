import { describe, expect, it } from '@jest/globals';

import { stacksAction } from '../cards/GuideNote';

describe('guide note action', () => {
  it('stays beside the words while they keep most of the room', () => {
    // 300 pt beside the critter, a 60 pt "See" pill: the words keep 230.
    expect(stacksAction(300, 60, 10)).toBe(false);
  });

  it('moves under the words when it would squeeze them under the share', () => {
    // "Find bookings in my email" is about 190 pt wide.
    expect(stacksAction(300, 190, 10)).toBe(true);
  });

  it('stays put before anything is measured', () => {
    expect(stacksAction(0, 190, 10)).toBe(false);
    expect(stacksAction(300, 0, 10)).toBe(false);
  });
});
