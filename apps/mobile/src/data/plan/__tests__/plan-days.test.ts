/**
 * When the plan screens ask the server for a trip's days: only for its organiser, only once its
 * dates are locked, and only while it has no plan of any kind (the server writes the days itself
 * when dates lock; this covers trips whose dates were locked before that).
 */
import { describe, expect, it } from '@jest/globals';

import type { PlanTripRow } from '../queries';
import { needsPlanDays } from '../use-plan-days';

const trip = (over: Partial<PlanTripRow> = {}) =>
  ({
    id: 't1',
    phase: 'planning',
    start_date: '2026-10-12',
    end_date: '2026-10-19',
    current_version_id: null,
    draft_version_id: null,
    ...over,
  }) as PlanTripRow;
const plan = (over: Partial<PlanTripRow> = {}, organiser = true) => ({
  loaded: true,
  organiser,
  trip: trip(over),
});

describe('needsPlanDays', () => {
  it('asks for an organiser’s trip with locked dates and no plan', () => {
    expect(needsPlanDays(plan())).toBe(true);
  });

  it('asks for nothing for a member, open dates, or a trip that has a plan or is over', () => {
    expect(needsPlanDays(plan({}, false))).toBe(false);
    expect(needsPlanDays(plan({ start_date: null }))).toBe(false);
    expect(needsPlanDays(plan({ draft_version_id: 'draft-1' }))).toBe(false);
    expect(needsPlanDays(plan({ current_version_id: 'v1' }))).toBe(false);
    expect(needsPlanDays(plan({ phase: 'post' }))).toBe(false);
    expect(needsPlanDays({ ...plan(), loaded: false })).toBe(false);
  });
});
