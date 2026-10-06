import { buildSharedPlanProjection, type TripSharedPlan } from '@cp/domain';

import { canManage, publishFace } from '../publish/publish-model';

const skeleton: NonNullable<TripSharedPlan['skeleton']> = {
  destination_id: '0191f0a0-0000-7000-8000-000000000001',
  destination_name: 'Bali',
  start_date: '2026-10-02',
  end_date: '2026-10-09',
  first_names: ['Mia', 'Tom'],
  days: [{ day_no: 1, theme: null, places: [] }],
  cost_pp_minor: 51_234,
  currency: 'USD',
  currency_exponent: 2,
  photo_keys: [],
  tips: [],
  travelled: true,
};

const plan = (over: Partial<NonNullable<TripSharedPlan['plan']>>): TripSharedPlan['plan'] => ({
  id: '0191f0a0-0000-7000-8000-000000000009',
  status: 'pending_consent',
  toggles: { names: false, costs: true, photos: true },
  requested_by_me: false,
  my_decision: 'pending',
  consents: { approved: 1, total: 3 },
  copies_count: 0,
  saves_count: 0,
  rating_avg: null,
  rating_count: 0,
  published_at: null,
  ...over,
});

const state = (over: Partial<TripSharedPlan>): TripSharedPlan => ({
  organiser: false,
  plan: null,
  skeleton,
  links: [],
  ...over,
});

describe('publishFace', () => {
  it('asks a participant who has not answered', () => {
    expect(publishFace(state({ plan: plan({}) })).kind).toBe('consent');
  });

  it('shows a count, never names, while others answer', () => {
    expect(publishFace(state({ plan: plan({ my_decision: 'approved' }) }))).toEqual({
      kind: 'waiting',
      planId: '0191f0a0-0000-7000-8000-000000000009',
      approved: 1,
      total: 3,
    });
  });

  it('offers the composer again after a decline, and nothing without a plan', () => {
    expect(publishFace(state({ plan: plan({ status: 'declined' }) }))).toEqual({
      kind: 'compose',
      after: 'declined',
    });
    expect(publishFace(state({ skeleton: null })).kind).toBe('no_plan');
  });

  it('lets only the asker or an organiser manage', () => {
    expect(canManage(state({ plan: plan({ status: 'published' }) }))).toBe(false);
    expect(canManage(state({ organiser: true }))).toBe(true);
  });
});

describe('the preview', () => {
  it('is the same projection the server publishes for the chosen toggles', () => {
    const preview = buildSharedPlanProjection(skeleton, {
      names: false,
      costs: true,
      photos: false,
    });
    expect(preview).toMatchObject({
      crew_names: null,
      crew_size: 2,
      cost_pp_rounded_minor: 51_000,
    });
  });
});
