import type { PlanState, PlanStateItem } from '@cp/domain';
import { driverViewSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { driverReplyOps, projectDriverView, type DriverViewInput } from '../../src/driver-view';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VILLA = uid(1);
const TERRACES = uid(2);
const SPA = uid(3);
const KECAK = uid(4);
const MUST_DO = uid(9);
const BOOKING = uid(10);
const OTHER_PROVIDER = uid(12);
const TZ = 'Asia/Makassar';

// Sentinels for everything that must never reach the driver.
const SECRET = {
  lastName: 'Kusumawardhani',
  phone: '+62 812 3456 7890',
  notes: 'Budget cap 2.5jt, Maya pays the spa',
  budgetMinor: 987_654_321,
  attendee: uid(77),
};

const item = (
  stableId: string,
  dayNo: number,
  start: string | undefined,
  end: string | undefined,
  extra: Partial<PlanStateItem> = {},
): PlanStateItem => ({
  stable_id: stableId,
  day_no: dayNo,
  lane: null,
  poi_id: stableId,
  custom_place: null,
  provider_id: OTHER_PROVIDER,
  booking_id: null,
  must_do_id: null,
  status: 'confirmed',
  flexibility: null,
  is_outdoor: false,
  created_by_kind: 'user',
  notes: SECRET.notes,
  locked_reason: null,
  amount_minor: SECRET.budgetMinor,
  currency: 'IDR',
  cost_model: 'per_person',
  attendee_ids: [SECRET.attendee],
  ...(start === undefined ? {} : { starts_at: start }),
  ...(end === undefined ? {} : { ends_at: end }),
  ...extra,
});

const state: PlanState = {
  days: [
    { day_no: 1, date: '2026-10-14', theme: 'Secret budget day' },
    { day_no: 2, date: '2026-10-15', theme: null },
    { day_no: 3, date: '2026-10-18', theme: null },
  ],
  items: [
    item(VILLA, 1, '2026-10-13T22:30:00Z', '2026-10-13T23:00:00Z'),
    item(TERRACES, 1, '2026-10-13T23:30:00Z', '2026-10-14T02:30:00Z', { must_do_id: MUST_DO }),
    item(SPA, 1, '2026-10-14T06:00:00Z', '2026-10-14T08:00:00Z'),
    item(uid(5), 2, '2026-10-15T02:00:00Z', undefined),
    item(KECAK, 3, '2026-10-18T10:00:00Z', '2026-10-18T11:00:00Z', { booking_id: BOOKING }),
  ],
};

const place = (name: string, category = 'sightseeing', nameLocal: string | null = null) => ({
  name,
  nameLocal,
  address: category === 'stay' ? 'Jalan Raya Sayan, Ubud' : 'Hidden street 1',
  category,
  lat: -8.5,
  lng: 115.25,
});

const input: DriverViewInput = {
  sharerDisplayName: `Winston ${SECRET.lastName}`,
  travellers: [{ displayName: `Winston ${SECRET.lastName}` }, { displayName: 'Maya Putri' }],
  mustDos: new Map([[MUST_DO, 'Jatiluwih rice terraces']]),
  dayNos: [1, 3],
  state,
  places: new Map([
    [VILLA, place('Villa Kayu Manis', 'stay')],
    [TERRACES, place('Jatiluwih rice terraces', 'sightseeing', 'Sawah Jatiluwih')],
    [SPA, place('Karsa Spa')],
    [uid(5), place('Day two secret stop')],
    [KECAK, place('Kecak dance')],
  ]),
  tz: TZ,
  terms: null,
};

describe('projectDriverView', () => {
  it('keeps budgets, prices, notes, attendees, last names, phones and other providers out', () => {
    const view = projectDriverView(input);
    const wire = JSON.stringify(view);
    for (const value of [
      SECRET.lastName,
      SECRET.phone,
      SECRET.notes,
      String(SECRET.budgetMinor),
      SECRET.attendee,
      OTHER_PROVIDER,
      BOOKING,
      MUST_DO,
      'Secret budget day',
      'Day two secret stop',
      'Hidden street',
    ]) {
      expect(wire).not.toContain(value);
    }
    for (const key of ['amount_minor', 'currency', 'notes', 'attendee_ids', 'provider_id']) {
      expect(wire).not.toContain(`"${key}"`);
    }
    // The view parses strictly as the public schema: no extra keys survive a round trip.
    expect(driverViewSchema.strict().safeParse(view).success).toBe(true);
  });

  it('shows first names, the shared days in local time, must-dos, pickups and bookings', () => {
    const view = projectDriverView(input);
    expect(view.sharer_first_name).toBe('Winston');
    expect(view.first_names).toEqual(['Winston', 'Maya']);
    expect(view.party_size).toBe(2);
    expect(view.days.map((d) => d.day_no)).toEqual([1, 3]);
    expect(view.stay_area).toBe('Jalan Raya Sayan, Ubud');
    expect(view.must_dos).toEqual(['Jatiluwih rice terraces']);
    const [pickup, terraces] = view.days[0]!.stops;
    expect(pickup).toMatchObject({ time: '06:30', pickup: true, name: 'Villa Kayu Manis' });
    expect(pickup!.maps_url).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    expect(terraces).toMatchObject({
      time: '07:30',
      must_do: true,
      duration_min: 180,
      name_local: 'Sawah Jatiluwih',
      address: null,
    });
    expect(view.days[1]!.stops[0]).toMatchObject({ name: 'Kecak dance', booked: true });
  });

  it("shows the driver's own agreed terms and nothing else priced", () => {
    const terms = {
      price_per_day_minor: 700_000,
      currency: 'IDR',
      includes: ['petrol' as const],
      overtime_per_hour_minor: 75_000,
      included_hours: 10,
      car: 'Toyota Avanza',
    };
    const view = projectDriverView({ ...input, terms });
    expect(view.terms).toEqual(terms);
    expect(JSON.stringify(view)).not.toContain(String(SECRET.budgetMinor));
  });
});

describe('driverReplyOps', () => {
  it('moves stops between the day slots, keeping each stop length', () => {
    const ops = driverReplyOps({
      state,
      dayNos: [1, 3],
      tz: TZ,
      suggestions: [{ day_no: 1, order: [VILLA, SPA, TERRACES], retime: [] }],
    });
    expect(ops.map((op) => [op.target, op.after?.starts_at, op.after?.ends_at])).toEqual([
      [TERRACES, '2026-10-14T06:00:00.000Z', '2026-10-14T09:00:00.000Z'],
      [SPA, '2026-10-13T23:30:00.000Z', '2026-10-14T01:30:00.000Z'],
    ]);
    expect(ops.every((op) => op.op === 'retime' && op.accepted === undefined)).toBe(true);
  });

  it('applies an explicit local time, marks booked stops and skips days not shared', () => {
    const ops = driverReplyOps({
      state,
      dayNos: [1, 3],
      tz: TZ,
      suggestions: [
        {
          day_no: 1,
          order: [],
          retime: [{ ref: TERRACES, at: '07:00' }],
          note: 'Tour buses arrive at 10.',
        },
        { day_no: 2, order: [], retime: [{ ref: uid(5), at: '08:00' }] },
        {
          day_no: 3,
          order: [],
          retime: [
            { ref: KECAK, at: '19:00' },
            { ref: VILLA, at: '09:00' },
          ],
        },
      ],
    });
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      target: TERRACES,
      after: { starts_at: '2026-10-13T23:00:00.000Z', ends_at: '2026-10-14T02:00:00.000Z' },
      reason: 'Tour buses arrive at 10.',
      booking_impact: false,
    });
    expect(ops[1]).toMatchObject({ target: KECAK, booking_impact: true });
  });
});
