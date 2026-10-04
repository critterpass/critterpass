import { describe, expect, it } from 'vitest';

import { crowdCurveRank, pickCrowdCurve } from '../../src/travel-data/crowd-curve';

const visits = { source: 'visits', approved_at: null };
const approved = { source: 'editorial', approved_at: '2026-10-04T00:00:00Z' };
const unapproved = { source: 'editorial', approved_at: null };
const bought = { source: 'besttime' };

describe('which crowd curve a place shows', () => {
  it('what crews saw beats an approved editorial week, which beats a bought forecast', () => {
    expect(pickCrowdCurve([bought, approved, visits])).toBe(visits);
    expect(pickCrowdCurve([bought, approved])).toBe(approved);
    expect(pickCrowdCurve([bought])).toBe(bought);
  });

  it('never shows an editorial week nobody approved', () => {
    expect(crowdCurveRank(unapproved)).toBeNull();
    expect(crowdCurveRank({ source: 'editorial' })).toBeNull();
    expect(pickCrowdCurve([unapproved])).toBeNull();
    expect(pickCrowdCurve([unapproved, bought])).toBe(bought);
  });

  it('ignores a source it does not know, and an empty list', () => {
    expect(pickCrowdCurve([{ source: 'rumour' }])).toBeNull();
    expect(pickCrowdCurve([])).toBeNull();
  });
});
