import { describe, expect, it } from '@jest/globals';

import { guideFor } from '../format';

describe("a destination's guide", () => {
  it('is the guest guide only when the place has none of its own', () => {
    expect(guideFor(null)).toMatchObject({ id: 'tokek', guest: true, learning: false });
    expect(guideFor('no-such-guide')).toMatchObject({ id: 'tokek', guest: true, learning: false });
  });

  it('is still learning a place whose picks nobody has checked, never a guest there', () => {
    expect(guideFor('ngua', false)).toMatchObject({
      id: 'ngua',
      name: 'Ngựa',
      kind: 'cp-006',
      guest: false,
      learning: true,
    });
    expect(guideFor('ngua', true)).toMatchObject({ guest: false, learning: false });
    // The guest guide covering a place is a guest, whatever the place's picks.
    expect(guideFor(null, false)).toMatchObject({ guest: true, learning: false });
  });
});
