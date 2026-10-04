/** Bali fixtures for the search lab scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { SearchHeaderProps } from '../search-header';
import type { PlaceFit } from '@cp/domain';

import type { PlainPlace } from '../plain-filters';
import type { SearchDay, SearchTrip } from '../use-search-trip';

export const WED = '0199a3f0-0000-7000-8000-00000000da03';

export const LAB_TRIP = { locavore: '0199a3f0-0000-7000-8000-00000000c0ca' };

export const BALI_DAYS: readonly SearchDay[] = [
  { id: '0199a3f0-0000-7000-8000-00000000da01', dayNo: 1, date: '2026-10-12', weekday: 'Mon' },
  { id: '0199a3f0-0000-7000-8000-00000000da02', dayNo: 2, date: '2026-10-13', weekday: 'Tue' },
  { id: WED, dayNo: 3, date: '2026-10-14', weekday: 'Wed' },
  { id: '0199a3f0-0000-7000-8000-00000000da04', dayNo: 4, date: '2026-10-15', weekday: 'Thu' },
  { id: '0199a3f0-0000-7000-8000-00000000da06', dayNo: 6, date: '2026-10-17', weekday: 'Sat' },
];

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

export const LAB_SEARCH_TRIP: SearchTrip = {
  loaded: true,
  destinationId: null,
  destination: 'Bali',
  destinationSlug: 'bali',
  guide: 'tokek',
  guideName: 'Tokek',
  days: BALI_DAYS,
  versionId: null,
  organiser: true,
  tz: 'Asia/Makassar',
  itemTitles: new Map([[LAB_TRIP.locavore, 'Locavore']]),
  placeNames: new Map(),
};

function fitsOn(dayNo: number, date: string, start: string, firstNight: boolean): PlaceFit {
  const day = BALI_DAYS.find((entry) => entry.dayNo === dayNo) ?? BALI_DAYS[0];
  const slot = { starts_at: `${date}T${start}:00+08:00`, ends_at: `${date}T21:00:00+08:00` };
  return {
    poi_id: null,
    best: { day_id: day?.id ?? WED, day_no: dayNo, grade: 'good', slot },
    days: [
      {
        day_id: day?.id ?? WED,
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
