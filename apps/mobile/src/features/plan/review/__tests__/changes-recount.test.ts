/**
 * The review's totals recount when a row is unticked: the set's ops carry each row's tick, a
 * dropped stop adds no cost to anyone's share and no drive, and a ticked one counts again.
 */
import { describe, expect, it } from '@jest/globals';
import { drivingDeltaMinutes } from '@cp/planner';

import type { PlanItem } from '../../overview/model/plan-model';
import { opsOf } from '../model/changes-ops';
import { reviewNumbers } from '../model/review-numbers';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const item = (n: number, at: string, lat: number, lng: number): PlanItem => ({
  stableId: id(n),
  dayNo: 1,
  startsAt: at,
  endsAt: null,
  tz: 'Asia/Makassar',
  label: `Stop ${String(n)}`,
  category: 'food',
  poiId: null,
  bookingId: null,
  mustDoId: null,
  lockedReason: null,
  status: null,
  byGuide: false,
  attendeeIds: [],
  lat,
  lng,
  amountMinor: null,
  currency: null,
  costModel: null,
});

const BASE = [
  item(1, '2026-10-17T00:00:00Z', -8.5069, 115.2625),
  item(2, '2026-10-17T07:00:00Z', -8.5075, 115.2635),
];
const RAW = JSON.stringify([
  {
    op: 'add',
    target: id(3),
    after: {
      day_no: 1,
      starts_at: '2026-10-17T02:00:00Z',
      ends_at: '2026-10-17T03:30:00Z',
      custom_place: { name: 'Far temple', lat: -8.4153, lng: 115.3153 },
      cost_model: 'per_person',
      amount_minor: 5_000,
      currency: 'USD',
    },
    reason: 'ideas_placed',
    affected_user_ids: [],
    booking_impact: false,
  },
]);

function totals(accepted: boolean) {
  const ops = opsOf(RAW, new Map([[id(3), accepted]]));
  const numbers = reviewNumbers({ items: BASE, ops, crew: [id(9), id(10)], currency: 'USD' });
  const driving = drivingDeltaMinutes({
    items: BASE.map((stop) => ({
      stableId: stop.stableId,
      dayNo: stop.dayNo,
      startsAt: stop.startsAt,
      point: { lat: stop.lat ?? 0, lng: stop.lng ?? 0 },
    })),
    ops,
    points: new Map(),
    legs: new Map(),
    driveFactor: 1.3,
    walkMaxM: 1200,
  });
  return { each: numbers.eachMinor, driving };
}

describe('review totals', () => {
  it('count a ticked placed stop and drop it when unticked', () => {
    const kept = totals(true);
    expect(kept.each).toBe(5_000);
    expect(kept.driving).toBeGreaterThan(0);
    expect(totals(false)).toEqual({ each: 0, driving: 0 });
  });
});
