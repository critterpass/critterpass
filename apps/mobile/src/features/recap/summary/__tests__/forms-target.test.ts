/** The forms card's link: this trip's critter, then the destination's own, then its set. */
import { describe, expect, it } from '@jest/globals';

import { formsTarget } from '../forms-target';

describe('forms card target', () => {
  it('opens the critter that got away', () => {
    expect(
      formsTarget({ gotAwayCritterId: 'carp', destinationCritterId: 'langur', setId: 'vn' }),
    ).toEqual({ screen: '3l-3', params: { critterId: 'carp' } });
  });

  it("opens the destination's own critter when nothing got away", () => {
    expect(
      formsTarget({ gotAwayCritterId: null, destinationCritterId: 'langur', setId: 'vn' }),
    ).toEqual({ screen: '3l-3', params: { critterId: 'langur' } });
  });

  it("falls back to the destination's set, and to no link without one", () => {
    expect(
      formsTarget({ gotAwayCritterId: null, destinationCritterId: null, setId: 'vn' }),
    ).toEqual({ screen: '3l-8', params: { setId: 'vn' } });
    expect(
      formsTarget({ gotAwayCritterId: null, destinationCritterId: null, setId: null }),
    ).toBeNull();
  });
});
