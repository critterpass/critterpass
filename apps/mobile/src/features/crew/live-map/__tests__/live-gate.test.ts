import { describe, expect, it } from '@jest/globals';

import { gateOf } from '../data/use-live-fixes';

describe('why the live map is closed', () => {
  it('asks for the Boost when the trip is not boosted, whatever else the answer says', () => {
    expect(gateOf('ENTITLEMENT_REQUIRED', null)).toBe('boost_required');
    expect(gateOf('ENTITLEMENT_REQUIRED', 'outside_trip_days')).toBe('boost_required');
  });

  it('says it is not a trip day when a boosted trip is outside its days', () => {
    expect(gateOf('NOT_ELIGIBLE', 'outside_trip_days')).toBe('outside_trip_days');
  });

  it('treats any other refusal as no longer being on the trip', () => {
    expect(gateOf('NOT_ELIGIBLE', null)).toBe('not_on_trip');
    expect(gateOf('FORBIDDEN', 'removed')).toBe('not_on_trip');
  });
});
