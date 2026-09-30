/** `/trip/{id}/<rest>` links forward to the trip's own `/{id}/<rest>` with the query kept. */

import { describe, expect, it } from '@jest/globals';

import { tripLinkTarget } from '../routes';

const TRIP = '0199b000-0000-7000-8000-00000000b001';

describe('trip link forwarding', () => {
  it('maps the plan, a review and a day to the trip routes', () => {
    expect(tripLinkTarget(TRIP, ['plan'], {})).toBe(`/${TRIP}/plan`);
    expect(tripLinkTarget(TRIP, ['review', 'cs-1'], {})).toBe(`/${TRIP}/review/cs-1`);
    expect(tripLinkTarget(TRIP, 'day', {})).toBe(`/${TRIP}/day`);
  });

  it('keeps the query and re-encodes each segment', () => {
    expect(tripLinkTarget(TRIP, ['decide', 'a b'], { from: 'push', tag: ['x', 'y'] })).toBe(
      `/${TRIP}/decide/a%20b?from=push&tag=x&tag=y`,
    );
    expect(tripLinkTarget(TRIP, undefined, {})).toBe(`/${TRIP}`);
  });
});
