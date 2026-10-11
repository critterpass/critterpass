import { describe, expect, it } from '@jest/globals';

import { fromGuideCircle } from '../guide-href';

describe('fromGuideCircle', () => {
  it('adds from=circle to a path href, after any query it already has', () => {
    expect(fromGuideCircle('/guide')).toBe('/guide?from=circle');
    expect(fromGuideCircle('/guide?tripId=t1')).toBe('/guide?tripId=t1&from=circle');
  });

  it('adds from=circle to an object href, keeping its params', () => {
    expect(fromGuideCircle({ pathname: '/guide', params: { tripId: 't1' } })).toEqual({
      pathname: '/guide',
      params: { tripId: 't1', from: 'circle' },
    });
  });
});
