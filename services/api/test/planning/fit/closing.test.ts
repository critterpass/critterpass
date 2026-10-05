/**
 * The opening check: a stop pushed past its place's closing time, or onto a day it is shut, is
 * named with when it closes; a stop inside its hours, a place with no known hours and a visit that
 * runs past midnight into an overnight span are not.
 */
import type { Hours } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { closedStops } from '../../../src/planning/fit/closing';

const TZ = 'Asia/Makassar';
const FOREST = '00000000-0000-4000-8000-000000000001';
const BAR = '00000000-0000-4000-8000-000000000002';
const UNKNOWN = '00000000-0000-4000-8000-000000000003';
const days = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;
const daily = (start: string, end: string): Hours => ({
  weekly: Object.fromEntries(days.map((day) => [day, [{ start, end }]])),
});
const hours = new Map<string, Hours>([
  [FOREST, daily('08:30', '18:00')],
  [BAR, daily('17:00', '02:00')],
]);
const stop = (key: string, poi: string, from: string, to: string) => ({
  key,
  poi_id: poi,
  starts_at: `2026-10-20T${from}:00+08:00`,
  ends_at: `2026-10-${to.startsWith('+') ? '21' : '20'}T${to.replace('+', '')}:00+08:00`,
});

describe('the opening check', () => {
  it('names a stop pushed past closing with when its place closes', () => {
    expect(closedStops([stop('forest', FOREST, '20:25', '21:25')], hours, TZ)).toEqual([
      { key: 'forest', closes: '18:00' },
    ]);
    expect(closedStops([stop('forest', FOREST, '17:30', '18:30')], hours, TZ)).toEqual([
      { key: 'forest', closes: '18:00' },
    ]);
  });

  it('passes a stop inside its hours, a late bar into the night, and a place with no hours', () => {
    expect(
      closedStops(
        [
          stop('forest', FOREST, '10:00', '11:30'),
          stop('bar', BAR, '23:00', '+01:00'),
          stop('cafe', UNKNOWN, '23:00', '23:30'),
        ],
        hours,
        TZ,
      ),
    ).toEqual([]);
  });

  it('says a place shut that day has no closing time', () => {
    const tuesdayShut = new Map([[FOREST, { weekly: { mo: [{ start: '08:30', end: '18:00' }] } }]]);
    expect(closedStops([stop('forest', FOREST, '10:00', '11:00')], tuesdayShut, TZ)).toEqual([
      { key: 'forest', closes: null },
    ]);
  });
});
