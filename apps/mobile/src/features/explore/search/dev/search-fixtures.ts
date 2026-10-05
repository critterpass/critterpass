/** Bali fixtures for the search lab scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { SearchHeaderProps } from '../search-header';
import type { PlaceFit } from '@cp/domain';

import type { PlainPlace } from '../plain-filters';
import type { SearchDay, SearchTrip } from '../use-search-trip';
import { weekdayOfDate } from '../weekday-names';

export const WED = '0199a3f0-0000-7000-8000-00000000da03';

export const LAB_TRIP = { locavore: '0199a3f0-0000-7000-8000-00000000c0ca' };

const DAY_DATES: readonly [string, number, string][] = [
  ['0199a3f0-0000-7000-8000-00000000da01', 1, '2026-10-12'],
  ['0199a3f0-0000-7000-8000-00000000da02', 2, '2026-10-13'],
  [WED, 3, '2026-10-14'],
  ['0199a3f0-0000-7000-8000-00000000da04', 4, '2026-10-15'],
  ['0199a3f0-0000-7000-8000-00000000da06', 6, '2026-10-17'],
];

/** The lab trip's days, their weekdays in the app's language (read at render). */
export function baliDays(): SearchDay[] {
  return DAY_DATES.map(([id, dayNo, date]) => ({ id, dayNo, date, weekday: weekdayOfDate(date) }));
}

export function header(value: string): SearchHeaderProps {
  return {
    value,
    onChangeText: () => undefined,
    onSubmit: () => undefined,
    onCancel: () => undefined,
    destination: 'Bali',
    guide: 'tokek',
    guideName: 'Tokek',
    autoFocus: value === '',
  };
}

export function labSearchTrip(): SearchTrip {
  return {
    loaded: true,
    destinationId: null,
    destination: 'Bali',
    destinationSlug: 'bali',
    guide: 'tokek',
    guideName: 'Tokek',
    days: baliDays(),
    versionId: null,
    organiser: true,
    tz: 'Asia/Makassar',
    itemTitles: new Map([[LAB_TRIP.locavore, 'Locavore']]),
    placeNames: new Map(),
    planDays: new Map(),
  };
}

function fitsOn(dayNo: number, date: string, start: string, firstNight: boolean): PlaceFit {
  const day = DAY_DATES.find((entry) => entry[1] === dayNo);
  const slot = { starts_at: `${date}T${start}:00+08:00`, ends_at: `${date}T21:00:00+08:00` };
  return {
    poi_id: null,
    best: { day_id: day?.[0] ?? WED, day_no: dayNo, grade: 'good', slot },
    days: [
      {
        day_id: day?.[0] ?? WED,
        day_no: dayNo,
        grade: 'good',
        slot,
        reasons: firstNight ? [{ code: 'first_night', params: { day_no: dayNo } }] : [],
      },
    ],
  };
}

const place = (
  id: string,
  name: string,
  area: string,
  minutes: number,
  closesAt: string,
  fit: PlaceFit,
): PlainPlace => ({
  id,
  name,
  category: 'food',
  area,
  minutes: { value: minutes, mode: 'drive' },
  closesAt,
  fit,
});

export const SAYAN_PLACES: readonly PlainPlace[] = [
  place('sayan', 'Sayan House', 'Sayan', 8, '23:00', fitsOn(1, '2026-10-12', '19:00', true)),
  place('bridges', 'Bridges', 'Campuhan', 12, '23:00', fitsOn(4, '2026-10-15', '19:30', false)),
  place('murnis', 'Murni’s Warung', 'Ubud', 10, '22:30', fitsOn(6, '2026-10-17', '19:00', false)),
];
