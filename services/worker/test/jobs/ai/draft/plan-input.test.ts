/**
 * The plan input as the draft job builds it: no flight times (the planner assumes an afternoon
 * landing and a midday last day), and a time of day read only from must-dos a member typed, never
 * from the name of a place picked from search.
 */
import { dayWindow, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import type { DraftTripData } from '../../../../src/jobs/ai/draft/load';
import { buildPlanInput } from '../../../../src/jobs/ai/draft/plan-input';

const id = (n: number) => `0199c000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const place = (n: number, name: string, category: string): DraftPoi => ({
  id: id(n),
  name,
  category,
  lat: 16.06 + n / 1000,
  lng: 108.22,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 90,
  editorial: true,
  mustSee: false,
});

const PLACES = [
  place(1, 'Morning Glory Mother’s Kitchen', 'food'),
  place(2, 'Nhà hàng Bình Minh', 'food'),
  place(3, 'Marble Mountains', 'temple_shrine'),
];

const TRIP: DraftTripData = {
  tripId: id(100),
  crewId: id(101),
  status: 'drafting',
  startDate: '2026-10-02',
  endDate: '2026-10-04',
  tz: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  destinationId: id(102),
  destination: 'Đà Nẵng, Vietnam',
  guideSlug: null,
  members: [{ uid: id(201), name: 'Khánh', tastes: [] }],
  mustDos: [
    { id: id(301), ownerId: id(201), poiId: id(1), title: 'Morning Glory Mother’s Kitchen' },
    { id: id(302), ownerId: id(201), poiId: id(2), title: 'Nhà hàng Bình Minh' },
    { id: id(303), ownerId: id(201), poiId: null, title: 'Marble Mountains at sunrise' },
  ],
  diets: [],
  dietsBy: [],
  budget: null,
  rooms: null,
  bands: null,
};

const input = buildPlanInput(TRIP, PLACES, {
  jobId: id(400),
  skeletonRoute: 'draft.skeleton',
  closures: [],
  wished: { places: new Map([[id(303), id(3)]]), offered: [], options: new Map() },
});

describe('the plan input the draft job builds', () => {
  it('reads a time of day from a typed must-do, never from a picked place’s name', () => {
    const when = Object.fromEntries(input.frame.mustDos.map((m) => [m.id, m.when ?? null]));
    expect(when).toEqual({ [id(301)]: null, [id(302)]: null, [id(303)]: 'sunrise' });
  });

  it('carries no flight times: the first day starts at two, the last ends at noon', () => {
    expect(input.frame.arrivalMin).toBeNull();
    expect(input.frame.departureMin).toBeNull();
    expect(dayWindow(input.frame, 0)).toMatchObject({ startMin: 14 * 60, earliestMin: 14 * 60 });
    expect(dayWindow(input.frame, 2)).toMatchObject({ endMin: 12 * 60, latestMin: 12 * 60 });
  });
});
