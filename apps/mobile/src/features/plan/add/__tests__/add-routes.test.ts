/**
 * The params other screens open Add to plan with: a day by number or by its plan day id, a start
 * as HH:MM or as an instant read on the trip's clock, and nothing unreadable passed on.
 */
import { describe, expect, it } from '@jest/globals';

import { originDayId, presetFromParams, resolvePreset } from '../routes';

const DAYS = [
  { id: '00000000-0000-4000-8000-000000000101', day_no: 1, date: '2026-10-16' },
  { id: '00000000-0000-4000-8000-000000000102', day_no: 2, date: '2026-10-17' },
];

describe('add to plan params', () => {
  it('reads a day number and an HH:MM start', () => {
    const route = presetFromParams({ day: '2', start: '08:00' });
    expect(resolvePreset(route, DAYS, 'Asia/Makassar')).toEqual({ dayNo: 2, startMin: 480 });
  });

  it('reads the place page’s day id and instant on the trip’s clock', () => {
    const route = presetFromParams({ dayId: DAYS[1]!.id, start: '2026-10-17T00:00:00Z' });
    expect(resolvePreset(route, DAYS, 'Asia/Makassar')).toEqual({ dayNo: 2, startMin: 480 });
  });

  it('drops what it cannot read', () => {
    const route = presetFromParams({ day: 'soon', start: 'whenever', dayId: '' });
    expect(resolvePreset(route, DAYS, 'Asia/Makassar')).toEqual({});
  });
});

describe('the day the sheet was opened from', () => {
  const search = (params: object) => ({ name: 'search', params });

  it('is the day of the newest screen under it that is about one day', () => {
    const state = {
      routes: [
        { params: { tripId: 't' } },
        {
          state: {
            routes: [
              search({ scope: 'day', dayId: DAYS[0]!.id }),
              search({ scope: 'day', dayId: DAYS[1]!.id }),
              { params: { placeId: 'p' } },
            ],
          },
        },
      ],
    };
    const origin = originDayId(state);
    expect(origin).toBe(DAYS[1]!.id);
    // The sheet then opens on that day, though the screen in between passed only the place.
    expect(resolvePreset({ dayId: origin }, DAYS, 'Asia/Makassar')).toEqual({ dayNo: 2 });
  });

  it('is nothing when no screen under it is about a day', () => {
    expect(originDayId({ routes: [search({ scope: 'trip' }), search({ scope: 'day' })] })).toBe(
      undefined,
    );
    expect(originDayId(undefined)).toBe(undefined);
  });
});
