import { describe, expect, it } from 'vitest';

import { ftfEligible } from '../src';

describe('ftfEligible', () => {
  it("covers a crew's first crew trip only", () => {
    expect(ftfEligible({ isSolo: false, earlierCrewTrips: 0 })).toBe(true);
    expect(ftfEligible({ isSolo: false, earlierCrewTrips: 1 })).toBe(false);
  });

  it('never covers a solo trip', () => {
    expect(ftfEligible({ isSolo: true, earlierCrewTrips: 0 })).toBe(false);
  });
});
