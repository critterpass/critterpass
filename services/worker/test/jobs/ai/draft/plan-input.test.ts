/**
 * The plan input as the draft job builds it: the crew's shared flight or train times when a
 * booking says them (else the planner assumes a midday landing and an early-evening departure), a
 * time of day read only from must-dos a member typed, never from the name of a place picked from
 * search, and a must-do planned at the recommended row of its spot.
 */
import { dayWindow, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import type { DraftTripData } from '../../../../src/jobs/ai/draft/load';
import { buildPlanInput, transportTimes } from '../../../../src/jobs/ai/draft/plan-input';

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
    { id: id(304), ownerId: id(201), poiId: null, title: 'Chợ đêm Sơn Trà', when: 'night' },
  ],
  diets: [],
  dietsBy: [],
  budget: null,
  rooms: null,
  bands: null,
  transport: [],
};

const input = buildPlanInput(TRIP, PLACES, {
  jobId: id(400),
  skeletonRoute: 'draft.skeleton',
  closures: [],
  wished: { places: new Map([[id(303), id(3)]]), offered: [], options: new Map() },
});

describe('the plan input the draft job builds', () => {
  it('takes a must-do’s time of day from its stored decision, never from its words', () => {
    const when = Object.fromEntries(input.frame.mustDos.map((m) => [m.id, m.when ?? null]));
    expect(when).toEqual({ [id(301)]: null, [id(302)]: null, [id(303)]: null, [id(304)]: 'night' });
  });

  it('carries no flight times without a booking: the first day starts at two, the last ends at three', () => {
    expect(input.frame.arrivalMin).toBeNull();
    expect(input.frame.departureMin).toBeNull();
    expect(dayWindow(input.frame, 0)).toMatchObject({ startMin: 14 * 60, earliestMin: 14 * 60 });
    expect(dayWindow(input.frame, 2)).toMatchObject({ endMin: 15 * 60, latestMin: 15 * 60 });
  });

  it('plans from the last shared landing on the first day and the first leaving on the last', () => {
    const times = transportTimes({
      ...TRIP,
      transport: [
        // Lands 09:40 local on the first day; a second traveller lands 11:15.
        { startsAt: '2026-10-02T00:30:00Z', endsAt: '2026-10-02T02:40:00Z' },
        { startsAt: '2026-10-02T02:00:00Z', endsAt: '2026-10-02T04:15:00Z' },
        // A train on the middle day says nothing about either end.
        { startsAt: '2026-10-03T03:00:00Z', endsAt: '2026-10-03T05:00:00Z' },
        // Leaves 19:05 local on the last day, lands after midnight; another leaves at 21:00.
        { startsAt: '2026-10-04T12:05:00Z', endsAt: '2026-10-04T18:00:00Z' },
        { startsAt: '2026-10-04T14:00:00Z', endsAt: null },
      ],
    });
    expect(times).toEqual({ arrivalMin: 11 * 60 + 15, departureMin: 19 * 60 + 5 });
  });

  it('on a one-day trip only a leg after the landing is the way out', () => {
    const times = transportTimes({
      ...TRIP,
      endDate: TRIP.startDate,
      transport: [
        { startsAt: '2026-10-02T00:30:00Z', endsAt: '2026-10-02T02:40:00Z' },
        { startsAt: '2026-10-02T11:00:00Z', endsAt: '2026-10-02T13:00:00Z' },
      ],
    });
    // The evening leg also ends that day, so the crew is there to plan for only once it lands.
    expect(times).toEqual({ arrivalMin: 20 * 60, departureMin: null });
  });

  it('plans a must-do picked as a stay at the recommended row on the same doorstep', () => {
    const villa: DraftPoi = { ...place(5, 'Crazy House', 'other'), lat: 11.935, lng: 108.4305 };
    const guesthouse: DraftPoi = {
      ...villa,
      id: id(6),
      name: 'The Crazy House',
      category: 'stay',
      editorial: false,
      lat: villa.lat + 0.00005,
    };
    const swapped = buildPlanInput(
      {
        ...TRIP,
        mustDos: [{ id: id(304), ownerId: id(201), poiId: guesthouse.id, title: guesthouse.name }],
      },
      [...PLACES, villa, guesthouse],
      { jobId: id(400), skeletonRoute: 'draft.skeleton', closures: [] },
    );
    expect(swapped.frame.mustDos.map((m) => m.poiId)).toEqual([villa.id]);
    expect(swapped.pools.mustDos.map((slot) => slot.poiId)).toEqual([villa.id]);
  });
});
