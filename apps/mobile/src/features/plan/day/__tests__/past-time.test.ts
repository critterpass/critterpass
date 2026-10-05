/**
 * A stop put on a day that has begun at a time already gone: refused with the first start after
 * now that the day leaves free, past the stop that is on now; a start still to come is left be.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { pastTimePreview } from '../past-time';

const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const stop = (id: string, start: string | null, end: string | null): DayItem => ({
  stableId: id,
  dayNo: 1,
  title: id,
  category: null,
  start: start === null ? null : at(start),
  end: end === null ? null : at(end),
  tz: 'Asia/Ho_Chi_Minh',
  lane: null,
  attendeeIds: [],
  lock: null,
  status: 'confirmed',
  byGuide: true,
  notes: null,
  poiId: null,
  place: null,
  amountMinor: null,
  currency: null,
  costModel: null,
  bookingId: null,
});

const museum = stop('museum', '14:00', '16:00');
const beach = { ...stop('beach', null, null) };
const preview = (start: string, nowMin: number | null) =>
  pastTimePreview({
    stops: [museum, beach],
    stop: beach,
    start: at(start),
    end: at(start) + 90,
    nowMin,
    slot: { dayNo: 1, date: '2026-10-05' },
    travel: () => 10,
    locale: 'en-GB',
  });

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('a time already gone on a day that has begun', () => {
  it('is refused with the first free start after now, past the stop that is on', () => {
    expect(preview('09:30', at('14:30'))).toEqual({
      blocked: true,
      useStart: at('16:10'),
      line: '9:30 has passed.',
    });
  });

  it('is left be when the start is still to come, or the day has not begun', () => {
    expect(preview('17:00', at('14:30'))).toBe(null);
    expect(preview('09:30', null)).toBe(null);
  });
});
