/**
 * The draft screens read where a trip is from its status: a trip in set-up that already has its
 * days (an empty plan, or one she is building by hand) has no draft to review, and its first
 * guide draft still hands the review over to the drafting screen.
 */
import { describe, expect, it } from '@jest/globals';

import { hasDraftToReview, isBeingDrafted, isDraftRetired } from '../data/draft-stage';

const trip = (status: string, draftVersionId: string | null, isOrganiser = true) => ({
  status,
  draftVersionId,
  isOrganiser,
});
const running = { status: 'running' };

describe('a trip that has its days before any draft', () => {
  it('has no draft to review in set-up, with or without its days', () => {
    expect(hasDraftToReview(trip('setup', null))).toBe(false);
    expect(hasDraftToReview(trip('setup', 'days'))).toBe(false);
    expect(hasDraftToReview(trip('drafting', 'days'))).toBe(false);
  });

  it('has one once the guide delivered it, and after it was sent', () => {
    expect(hasDraftToReview(trip('draft_review', 'v1'))).toBe(true);
    expect(hasDraftToReview(trip('redrafting', 'v1'))).toBe(true);
    expect(hasDraftToReview(trip('proposed', 'v1'))).toBe(true);
    expect(hasDraftToReview(trip('draft_review', null))).toBe(false);
  });

  it('is being drafted while its first draft job runs, days or not', () => {
    expect(isBeingDrafted(trip('drafting', null), running)).toBe(true);
    expect(isBeingDrafted(trip('drafting', 'days'), running)).toBe(true);
    expect(isBeingDrafted(trip('setup', 'days'), null)).toBe(false);
    expect(isBeingDrafted(trip('drafting', 'days', false), running)).toBe(false);
    // A redraft of a day never sends her to the drafting screen.
    expect(isBeingDrafted(trip('redrafting', 'v1'), running)).toBe(false);
  });
});

describe('a trip whose plan is locked in', () => {
  it('retires the draft once the trip is confirmed or further along', () => {
    for (const status of ['confirmed', 'pre_trip', 'in_trip', 'post_trip', 'archived']) {
      expect(isDraftRetired({ status })).toBe(true);
    }
  });

  it('keeps the draft while it is still being reviewed or sent', () => {
    for (const status of ['drafting', 'draft_review', 'redrafting', 'proposed']) {
      expect(isDraftRetired({ status })).toBe(false);
    }
  });
});
