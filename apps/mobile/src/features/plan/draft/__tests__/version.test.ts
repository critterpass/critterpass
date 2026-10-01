import { describe, expect, it } from '@jest/globals';
import type { DraftCoverage, DraftMetrics } from '@cp/domain';

import { buildReview, setupChanges, type ItemRow, type SetupNow } from '../data/version';

const MAYA = { uid: '0199a6f0-0000-7000-8000-00000000aa01', name: 'Maya', joinIndex: 0 };
const ALEX = { uid: '0199a6f0-0000-7000-8000-00000000aa02', name: 'Alex', joinIndex: 1 };
const RIN = { uid: '0199a6f0-0000-7000-8000-00000000aa03', name: 'Rin', joinIndex: 2 };

const SETUP: DraftCoverage['setup'] = {
  start_date: '2027-04-02',
  end_date: '2027-04-05',
  must_do_ids: ['0199a6f0-0000-7000-8000-00000000bb01', '0199a6f0-0000-7000-8000-00000000bb02'],
  budget_version: 2,
  rooms_version: 1,
};
const NOW: SetupNow = {
  startDate: '2027-04-02',
  endDate: '2027-04-05',
  mustDoIds: ['0199a6f0-0000-7000-8000-00000000bb01', '0199a6f0-0000-7000-8000-00000000bb02'],
  budgetVersion: 2,
  roomsVersion: 1,
};

const COVERAGE: DraftCoverage = {
  must_dos: {
    total: 2,
    made: 1,
    missing: [
      { must_do_id: '0199a6f0-0000-7000-8000-00000000bb02', owner_id: ALEX.uid, reason: 'closed' },
    ],
  },
  flags: [],
  closures: [
    {
      poi_id: '0199a6f0-0000-7000-8000-00000000cc02',
      area: 'Market',
      closed_from: '2027-04-03',
      closed_to: '2027-04-03',
      reason: 'Holiday',
      source_url: 'https://example.com/market',
    },
  ],
  stays: [],
  places: {
    '0199a6f0-0000-7000-8000-00000000cc01': {
      name: 'Fushimi Inari',
      category: 'shrine',
      lat: 0,
      lng: 0,
      editorial: true,
    },
    '0199a6f0-0000-7000-8000-00000000cc02': {
      name: 'Market',
      category: 'food',
      lat: 0,
      lng: 0,
      editorial: true,
    },
    '0199a6f0-0000-7000-8000-00000000cc03': {
      name: 'Nara Park',
      category: 'park',
      lat: 0,
      lng: 0,
      editorial: true,
    },
  },
  setup: SETUP,
};

const METRICS: DraftMetrics = {
  currency: 'USD',
  cost_pp_minor: 131_000,
  target_pp_minor: 120_000,
  over_by_pp_minor: 11_000,
  transit_min: 90,
  days: [],
  validation: { first_pass_clean: true, repair_loops: 0, dropped: 0 },
};

function item(day: string, id: string, time: string, extra: Partial<ItemRow> = {}): ItemRow {
  return {
    day_id: day,
    stable_id: id,
    starts_at: `2027-04-0${day.slice(4)}T${time}:00+09:00`,
    tz: 'Asia/Tokyo',
    poi_id: null,
    must_do_id: null,
    category: 'activity',
    booking_id: null,
    locked_reason: null,
    ...extra,
  };
}

function review(setup: SetupNow = NOW, more: readonly ItemRow[] = []) {
  return buildReview({
    version: {
      id: 'v1',
      status: 'draft',
      parent_id: null,
      created_at: '2027-02-10T09:00:00Z',
      cost_pp_minor: 131_000,
      currency: 'USD',
      metrics: JSON.stringify(METRICS),
      coverage: JSON.stringify(COVERAGE),
    },
    days: [
      { id: 'day-3', day_no: 3, date: '2027-04-04', theme: 'Nara' },
      { id: 'day-1', day_no: 1, date: '2027-04-02', theme: 'Arrive' },
      { id: 'day-2', day_no: 2, date: '2027-04-03', theme: 'Inari' },
      { id: 'day-4', day_no: 4, date: '2027-04-05', theme: 'Home' },
    ],
    items: [
      item('day-2', 'i3', '15:00', { poi_id: '0199a6f0-0000-7000-8000-00000000cc02' }),
      item('day-2', 'i2', '06:00', {
        poi_id: '0199a6f0-0000-7000-8000-00000000cc01',
        must_do_id: '0199a6f0-0000-7000-8000-00000000bb01',
        locked_reason: 'must_do',
      }),
      item('day-3', 'i4', '09:00', { poi_id: '0199a6f0-0000-7000-8000-00000000cc03' }),
      item('day-1', 'i1', '11:00', {
        poi_id: '0199a6f0-0000-7000-8000-00000000cc01',
        booking_id: 'b1',
      }),
      ...more,
    ],
    mustDos: [
      {
        id: '0199a6f0-0000-7000-8000-00000000bb01',
        owner_id: MAYA.uid,
        title: 'Inari at dawn',
        external_action: null,
        external_deadline: null,
      },
      {
        id: '0199a6f0-0000-7000-8000-00000000bb02',
        owner_id: ALEX.uid,
        title: 'Museum',
        external_action: 'lottery',
        external_deadline: '2027-03-01',
      },
    ],
    people: [MAYA, ALEX, RIN],
    setup,
  });
}

describe('the private draft review', () => {
  it('orders days, lists their stops in time order and stamps must-do owners on their day', () => {
    const model = review();
    expect(model.days.map((day) => day.dayNo)).toEqual([1, 2, 3, 4]);
    const inari = model.days[1];
    expect(inari?.stops.map((stop) => stop.name)).toEqual(['Fushimi Inari', 'Market']);
    expect(inari?.stops[0]?.locked).toBe(true);
    expect(inari?.owners).toEqual([MAYA]);
  });

  it('lists a wallet booking under its own title and marks its day booked', () => {
    const flight = item('day-1', 'i0', '07:05', {
      category: 'flight',
      booking_id: 'b2',
      locked_reason: 'booking',
      notes: '9G 956 · SGN → DAD',
    });
    const note = item('day-3', 'i5', '08:00', { notes: 'Pack light' });
    const model = review(NOW, [flight, note]);
    expect(model.days[0]?.stops).toEqual([
      { name: '9G 956 · SGN → DAD', startsAt: flight.starts_at, tz: 'Asia/Tokyo', locked: true },
      expect.objectContaining({ name: 'Fushimi Inari' }),
    ]);
    // An item with neither a place nor a booking has nothing to be called: it stays off the row.
    expect(model.days[2]?.stops.map((stop) => stop.name)).toEqual(['Nara Park']);
    expect(model.days.map((day) => day.booked)).toEqual([true, false, false, false]);
  });

  it('tags only a middle day with stops and no must-do or booking as optional', () => {
    const optional = review().days.map((day) => [day.dayNo, day.optional]);
    expect(optional).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, false],
    ]);
  });

  it('flags a day whose stop sits in a cited closure on that date', () => {
    const closed = review().days.map((day) => day.closed);
    expect(closed).toEqual([false, true, false, false]);
  });

  it('names each missing must-do with its owner and reason, and reads the overspend', () => {
    const model = review();
    expect(model.mustDos).toMatchObject({ total: 2, made: 1, owners: [MAYA] });
    expect(model.mustDos.missing).toEqual([{ title: 'Museum', owner: ALEX, reason: 'closed' }]);
    expect(model.overByMinor).toBe(11_000);
    expect(model.costPpMinor).toBe(131_000);
  });

  it('is stale when setup moved since the draft, and a new unplaced must-do makes the redraft free', () => {
    expect(review().stale).toEqual([]);
    const moved = review({
      ...NOW,
      mustDoIds: [
        '0199a6f0-0000-7000-8000-00000000bb01',
        '0199a6f0-0000-7000-8000-00000000bb02',
        '0199a6f0-0000-7000-8000-00000000bb03',
      ],
      budgetVersion: 3,
    });
    expect(moved.stale).toEqual(['must_dos', 'budget']);
    expect(moved.lateMustDo).toBe(true);
    const removed = review({ ...NOW, mustDoIds: ['0199a6f0-0000-7000-8000-00000000bb01'] });
    expect(removed.stale).toEqual(['must_dos']);
    expect(removed.lateMustDo).toBe(false);
  });
});

describe('setup changes', () => {
  it('spots new dates and rooms', () => {
    expect(setupChanges(SETUP, { ...NOW, endDate: '2027-04-06', roomsVersion: 2 })).toEqual([
      'dates',
      'rooms',
    ]);
  });
});
