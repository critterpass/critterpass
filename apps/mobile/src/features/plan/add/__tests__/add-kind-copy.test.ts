/**
 * WHY leads with the time of day the place is for when the guide chose the time, and leaves it
 * out when the person chose it or the day does not take the place.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayFit } from '@cp/domain';
import type { FitPlace } from '@cp/planner';

import { whyTiles, type WhyInput } from '../add-kind-copy';

const day: DayFit = {
  day_id: '00000000-0000-4000-8000-000000000105',
  day_no: 5,
  grade: 'good',
  slot: { starts_at: '2026-10-23T17:00:00+08:00', ends_at: '2026-10-23T18:00:00+08:00' },
  reasons: [{ code: 'hours_unknown', params: {} }],
};
const temple: FitPlace = {
  poiId: null,
  point: { lat: -8.62, lng: 115.09 },
  category: 'temple_shrine',
  hours: null,
  outdoor: true,
  name: 'Tanah Lot',
  bestTimeText: 'Sunset hour for golden light',
};
const input: WhyInput = {
  day,
  month: 'Oct',
  stopName: () => null,
  place: temple,
  tz: 'Asia/Makassar',
  lengthMin: 60,
  timePicked: false,
};

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('why this time', () => {
  it('says first what time of day the place is for', () => {
    expect(whyTiles(input).map((tile) => tile.text)).toEqual([
      'Best around sunset',
      'Opening hours not known yet',
    ]);
    const bar = { ...temple, category: 'nightlife', name: '40 Thieves', bestTimeText: null };
    expect(whyTiles({ ...input, place: bar })[0]?.text).toBe('Best after dark');
  });

  it('leaves it out for a time the person picked, a day that does not fit, or any-time places', () => {
    expect(whyTiles({ ...input, timePicked: true }).map((tile) => tile.key)).toEqual(['hours']);
    expect(whyTiles({ ...input, day: { ...day, grade: 'no', slot: null } })[0]?.key).not.toBe(
      'kind',
    );
    const museum = { ...temple, category: 'museum', name: 'Blanco Museum', bestTimeText: null };
    expect(whyTiles({ ...input, place: museum }).map((tile) => tile.key)).toEqual(['hours']);
  });
});
