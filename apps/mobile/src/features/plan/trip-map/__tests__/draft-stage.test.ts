/**
 * Where an organiser's own plan is, read from the trip's status: hers to build on the trip's days,
 * with the guide (nothing of hers can be changed until it is done), or a draft ready to review.
 */
import { describe, expect, it } from '@jest/globals';

import { draftStageOf } from '../draft-stage';

describe('draftStageOf', () => {
  it('is hers to build while the trip is in set-up', () => {
    expect(draftStageOf('setup')).toBe('building');
    expect(draftStageOf('won')).toBe('building');
  });

  it('is with the guide while a draft or a redraft runs', () => {
    expect(draftStageOf('drafting')).toBe('guideWorking');
    expect(draftStageOf('redrafting')).toBe('guideWorking');
  });

  it('is a draft to review once the guide delivered it or she took her own plan on', () => {
    expect(draftStageOf('draft_review')).toBe('review');
  });
});
