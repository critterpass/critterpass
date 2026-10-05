/**
 * What a saved draft says of itself for the review screen: the essential places it leaves out,
 * each with why, and every place under the name the organiser reads.
 */
import { draftCoverageSchema } from '@cp/domain';
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import type { DraftTripData } from '../../../../src/jobs/ai/draft/load';
import { draftCoverage } from '../../../../src/jobs/ai/draft/persist';
import { buildPlanInput } from '../../../../src/jobs/ai/draft/plan-input';

const id = (n: number) => `0199e000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const place = (n: number, name: string, extra: Partial<DraftPoi> = {}): DraftPoi => ({
  id: id(n),
  name,
  category: 'nature',
  lat: 11.94 + n / 1000,
  lng: 108.44,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 60,
  editorial: true,
  mustSee: true,
  ...extra,
});
const VALLEY = place(1, 'Valley of Love', { nameLocal: 'Thung lũng Tình Yêu', essential: true });
const LAKE = place(2, 'Xuân Hương Lake', { nameLocal: 'Hồ Xuân Hương', essential: true });
const TRIP: DraftTripData = {
  tripId: id(100),
  crewId: id(101),
  status: 'drafting',
  startDate: '2026-10-19',
  endDate: '2026-10-22',
  tz: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  destinationId: id(102),
  destination: 'Đà Lạt, Vietnam',
  guideSlug: null,
  members: [{ uid: id(201), name: 'Linh', tastes: [] }],
  mustDos: [],
  diets: [],
  dietsBy: [],
  budget: null,
  rooms: null,
  bands: null,
  transport: [],
  languages: ['vi'],
};

function coverage(locale: string) {
  const input = {
    ...buildPlanInput(TRIP, [VALLEY, LAKE], {
      jobId: id(400),
      skeletonRoute: 'draft.skeleton',
      closures: [],
    }),
    locale,
  };
  const at = (hour: number) => `2026-10-20T${String(hour - 7).padStart(2, '0')}:00:00.000Z`;
  return draftCoverage({
    jobId: id(400),
    trip: TRIP,
    input,
    outcome: {
      itinerary: {
        currency: 'VND',
        days: [
          {
            day_no: 2,
            date: '2026-10-20',
            theme: 'A day',
            items: [
              {
                stable_id: id(500),
                kind: 'activity',
                poi_id: LAKE.id,
                starts_at: at(10),
                ends_at: at(11),
                tz: TRIP.tz,
                must_do_id: null,
                booking_id: null,
                locked_reason: null,
                cost_model: 'per_person',
                amount_minor: 0,
                currency: 'VND',
                travel_min: 0,
                note: null,
              },
            ],
          },
        ],
      },
      first: { ok: true, violations: [], costPpMinor: 0 },
      loops: 0,
      dropped: [],
    },
    stays: [],
    closures: [],
    slotAvailable: [],
  });
}

describe('a saved draft’s coverage', () => {
  it('names what was left out and why, as the organiser reads it', () => {
    const hers = coverage('vi');
    expect(draftCoverageSchema.safeParse(hers).success).toBe(true);
    expect(hers.essentials_left_out).toEqual([
      { poi_id: VALLEY.id, name: 'Thung lũng Tình Yêu', reason: 'no_room' },
    ]);
    expect(hers.places[LAKE.id]?.name).toBe('Hồ Xuân Hương');
    const english = coverage('en');
    expect(english.essentials_left_out?.[0]?.name).toBe('Valley of Love');
    expect(english.places[LAKE.id]?.name).toBe('Xuân Hương Lake');
  });
});
