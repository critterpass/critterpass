/**
 * The params other screens open Add to plan with: a day by number or by its plan day id, a start
 * as HH:MM or as an instant read on the trip's clock, and nothing unreadable passed on.
 */
import { describe, expect, it } from '@jest/globals';

import { presetFromParams, resolvePreset } from '../routes';

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
