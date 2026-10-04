/**
 * Supplier truthfulness in a draft: stay nights are priced from our own cost bands and show a
 * free-cancellation date only when the crew imported the booking that carries it; no supplier
 * name, link or price ever reaches a drafting prompt (the guide sees our place ids, names and
 * price levels only).
 */
import {
  buildDayRequest,
  buildRedraftRequest,
  buildSkeletonRequest,
  normaliseSkeleton,
} from '@cp/ai';
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import type { DraftTripData } from '../../../../src/jobs/ai/draft/load';
import { buildPlanInput } from '../../../../src/jobs/ai/draft/plan-input';
import { stayRows } from '../../../../src/jobs/ai/draft/suppliers';

const place = (n: number, name: string, category: string): DraftPoi => ({
  id: `0199d000-0001-7000-8000-00000000000${n}`,
  name,
  category,
  lat: 38.71 + n / 1000,
  lng: -9.14,
  tz: 'Europe/Lisbon',
  hours: null,
  priceLevel: 2,
  tags: category === 'food' ? ['vegetarian_options'] : [],
  durationMin: 90,
  editorial: true,
  mustSee: false,
});

const PLACES = [
  place(1, 'Belém Tower', 'museum'),
  place(2, 'Alfama walk', 'other'),
  place(3, 'LX Factory', 'shopping'),
  place(4, 'Time Out Market', 'market'),
  place(5, 'O Trevo', 'food'),
  place(6, 'Jardim dos Sentidos', 'food'),
];

const TRIP: DraftTripData = {
  tripId: '0199d000-0002-7000-8000-000000000001',
  crewId: '0199d000-0002-7000-8000-000000000002',
  status: 'drafting',
  startDate: '2026-11-09',
  endDate: '2026-11-12',
  tz: 'Europe/Lisbon',
  currency: 'EUR',
  destinationId: '0199d000-0002-7000-8000-000000000003',
  destination: 'Lisbon, Portugal',
  guideSlug: 'sardi',
  members: [
    { uid: '0199d000-0003-7000-8000-000000000001', name: 'Ana', tastes: ['history'] },
    { uid: '0199d000-0003-7000-8000-000000000002', name: 'Leo', tastes: ['street_food'] },
  ],
  mustDos: [],
  diets: [],
  dietsBy: [],
  budget: { targetMinor: 90_000, flightsMinor: 30_000, version: 1 },
  rooms: {
    version: 2,
    stays: [
      { stayType: 'guesthouse', nights: 1, nightlyPpMinor: 4_500 },
      { stayType: 'apartment', nights: 2, nightlyPpMinor: 6_000 },
    ],
    bookingId: null,
    freeCancelUntil: '2026-11-01T23:00:00.000Z',
  },
  bands: { foodPpDayMinor: 4_500, funPpDayMinor: 3_500 },
  transport: [],
};

describe('draft stays', () => {
  it('prices nights from our bands and shows free cancellation only from an imported booking', () => {
    const rows = stayRows(TRIP);
    expect(rows.map((r) => [r.stay_type, r.check_in, r.check_out, r.nightly_pp_minor])).toEqual([
      ['guesthouse', '2026-11-09', '2026-11-10', 4_500],
      ['apartment', '2026-11-10', '2026-11-12', 6_000],
    ]);
    expect(rows.every((r) => r.free_cancel_until === null && r.booking_id === null)).toBe(true);
    expect(rows[0]?.partners).toEqual(['agoda', 'trip_com', 'booking_cj']);

    const booked = stayRows({
      ...TRIP,
      rooms: {
        ...(TRIP.rooms as NonNullable<DraftTripData['rooms']>),
        bookingId: '0199d000-0009-7000-8000-000000000001',
      },
    });
    expect(booked.every((r) => r.free_cancel_until === '2026-11-01T23:00:00.000Z')).toBe(true);
    expect(booked.every((r) => r.partners.length === 0)).toBe(true);
  });
});

describe('drafting prompts', () => {
  it('carry our place ids, names and price levels only, never a supplier or a price', () => {
    const input = buildPlanInput(TRIP, PLACES, {
      jobId: '0199d000-0004-7000-8000-000000000001',
      skeletonRoute: 'draft.skeleton',
      closures: [],
    });
    const skeleton = normaliseSkeleton(input, {
      stay_area: 'Alfama',
      days: input.frame.dates.map((_, i) => ({
        day_no: i + 1,
        theme: 'Old Lisbon',
        area: 'Alfama',
        must_do_ids: [],
        poi_ids: ['p1', 'p2'],
      })),
    });
    const day = skeleton.days[1];
    if (day === undefined) throw new Error('no day 2');
    const requests = [
      buildSkeletonRequest(input),
      buildDayRequest(input, { day, usedElsewhere: new Set() }),
      buildRedraftRequest({
        ...input,
        base: {
          currency: 'EUR',
          days: [{ day_no: 2, date: day.date, theme: 'Old Lisbon', items: [] }],
        },
        dayNo: 2,
        reasons: ['cheaper'],
        note: null,
        chat: [],
      }),
    ];
    for (const request of requests) {
      const text = JSON.stringify(request);
      expect(text).not.toMatch(
        /agoda|trip_com|booking_cj|booking\.com|trip\.com|viator|klook|getyourguide|https?:/iu,
      );
      expect(text).not.toMatch(/€|EUR|4500|6000|90000|30000/u);
      expect(PLACES.some((p) => text.includes(p.name))).toBe(true);
    }
  });
});
