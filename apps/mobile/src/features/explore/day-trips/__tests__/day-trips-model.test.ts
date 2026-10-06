/**
 * The day trips Explore offers and the area page's decisions: the order and labels of the cards,
 * no section without links, who may add a day trip and when, and what the day picker says about
 * each day.
 */
import { describe, expect, it } from '@jest/globals';
import type { PlanState } from '@cp/domain';
import { i18n } from '@lingui/core';

import { loadCatalog } from '@cp/i18n';

import { destinationLinksSchema, linksOf } from '@/data/areas/area-links';
import { buildTripAreas, dayAreaOf } from '@/data/areas/trip-areas-model';
import recorded from '@/data/areas/__tests__/fixtures/links-cusco.json';

import { areaAction, pickerDays } from '../area-model';
import { dayTripsSection } from '../day-trips-model';

const CUSCO = '0192f000-0000-7000-8000-00000000c05c';
const MACHU = '0192f000-0000-7000-8000-0000000a4ea2';
const VALLEY = '0192f000-0000-7000-8000-0000000a4ea1';
const parsed = destinationLinksSchema.safeParse(recorded);
const links = parsed.success ? linksOf(parsed.data) : [];
const days = (areas: Record<number, string> = {}) =>
  [1, 2, 3, 4].map((n) => ({
    id: `d${n}`,
    day_no: n,
    date: `2026-11-1${n}`,
    destination_id: areas[n] ?? null,
  }));
const trip = (areas: Record<number, string> = {}, on = true, withLinks = links) =>
  buildTripAreas({
    on,
    destinationId: CUSCO,
    destinationName: 'Cusco',
    stops: [],
    days: days(areas),
    links: withLinks,
  });

describe('dayTripsSection', () => {
  it('lists the essential day trip first, each with its travel line, length and day', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'explore') });
    expect(dayTripsSection(trip({ 3: MACHU }))).toEqual({
      city: 'Cusco',
      cards: [
        {
          id: MACHU,
          name: 'Machu Picchu',
          travel: 'about 3 h 30 by train each way',
          length: 'full',
          dayNo: 3,
        },
        {
          id: VALLEY,
          name: 'Sacred Valley',
          travel: 'about 1 h 30 on a tour each way',
          length: 'full',
          dayNo: null,
        },
      ],
    });
  });

  it('has no section for a trip with no links, or with the switch off', () => {
    expect(dayTripsSection(trip({}, true, []))).toBeNull();
    expect(dayTripsSection(trip({ 3: MACHU }, false))).toBeNull();
  });
});

describe('areaAction', () => {
  const base = {
    organiser: true,
    organiserName: 'Maya',
    status: 'confirmed',
    online: true,
    versionId: 'v1',
    onDay: null,
  };

  it('lets the organiser add it online, and shows it disabled offline', () => {
    expect(areaAction(base)).toEqual({ kind: 'add' });
    expect(areaAction({ ...base, online: false })).toEqual({ kind: 'offline' });
  });

  it('tells a member who to ask', () => {
    expect(areaAction({ ...base, organiser: false })).toEqual({
      kind: 'member',
      organiser: 'Maya',
    });
  });

  it('waits for the guide while a draft is being written, and for days before there are any', () => {
    expect(areaAction({ ...base, status: 'drafting' })).toEqual({ kind: 'drafting' });
    expect(areaAction({ ...base, status: 'redrafting' })).toEqual({ kind: 'drafting' });
    expect(areaAction({ ...base, status: 'setup', versionId: null })).toEqual({ kind: 'noPlan' });
  });

  it('never changes a trip that is over', () => {
    expect(areaAction({ ...base, status: 'cancelled' })).toEqual({ kind: 'closed' });
  });

  it('shows the day it is on, with changes for the organiser while online only', () => {
    const onDay = dayAreaOf(trip({ 3: MACHU }), 3);
    expect(areaAction({ ...base, onDay })).toEqual({ kind: 'onDay', dayNo: 3, canChange: true });
    expect(areaAction({ ...base, onDay, online: false })).toMatchObject({ canChange: false });
    expect(areaAction({ ...base, onDay, organiser: false })).toMatchObject({ canChange: false });
  });
});

describe('pickerDays', () => {
  const item = (day: number, id: string, extra: Record<string, unknown> = {}) => ({
    stable_id: id,
    day_no: day,
    lane: null,
    poi_id: `poi-${id}`,
    booking_id: null,
    must_do_id: null,
    notes: null,
    created_by_kind: 'user' as const,
    ...extra,
  });
  const state = {
    days: [],
    items: [
      item(2, 'a'),
      item(2, 'b'),
      item(2, 'pin', { poi_id: null }),
      item(2, 'booked', { booking_id: 'bk-1' }),
      item(4, 'c'),
    ],
  } as unknown as PlanState;

  it('offers the days of the stop, warns on the first and last, and counts what moves', () => {
    const picker = pickerDays(trip({ 3: VALLEY }), state, CUSCO, MACHU);
    expect(picker.map((day) => day.dayNo)).toEqual([1, 2, 3, 4]);
    expect(picker[0]).toMatchObject({ edge: 'first', moves: 0, booked: false, otherArea: null });
    // Two stops on places leave for Ideas; the dropped pin and the booked stop stay.
    expect(picker[1]).toMatchObject({ edge: null, moves: 2, booked: true });
    expect(picker[2]).toMatchObject({ otherArea: 'Sacred Valley' });
    expect(picker[3]).toMatchObject({ edge: 'last', moves: 1 });
  });

  it('leaves out the day the area is already on', () => {
    const picker = pickerDays(trip({ 3: MACHU }), state, CUSCO, MACHU);
    expect(picker.map((day) => day.dayNo)).toEqual([1, 2, 4]);
  });
});
