/**
 * What PLAN opens in each switch state, which day a day-first hub lands on, and where the old and
 * new screen ids and the push links resolve once the planning screens have registered.
 */
import { describe, expect, it } from '@jest/globals';

import { hrefFor } from '@/lib/navigation/screen-registry';

import '../register';
import '../../overview/register';
import '../../day/register';
import { tripLinkTarget } from '../../overview/routes';
import { hubDay, planEntry } from '../plan-hub';
import { dayParam, sheetParam } from '../routes';

const TRIP = '0199b000-0000-7000-8000-00000000b001';

describe('plan hub', () => {
  it('opens the earlier overview while the redesign is off, whatever the hub says', () => {
    expect(planEntry({ redesign: false, hub: 'map' })).toBe('overview');
    expect(planEntry({ redesign: false, hub: 'day' })).toBe('overview');
  });

  it('opens the trip map or the day plan as the hub says once it is on', () => {
    expect(planEntry({ redesign: true, hub: 'map' })).toBe('map');
    expect(planEntry({ redesign: true, hub: 'day' })).toBe('day');
  });

  it('lands a day-first hub on today, else the first day with stops, else day 1', () => {
    const days = [
      { dayNo: 1, date: '2026-10-12', stops: 0 },
      { dayNo: 2, date: '2026-10-13', stops: 3 },
      { dayNo: 3, date: '2026-10-14', stops: 5 },
    ];
    expect(hubDay(days, '2026-10-14')).toBe(3);
    expect(hubDay(days, '2026-11-01')).toBe(2);
    expect(hubDay(days, null)).toBe(2);
    expect(
      hubDay(
        days.map((day) => ({ ...day, stops: 0 })),
        null,
      ),
    ).toBe(1);
    expect(hubDay([], null)).toBeNull();
  });
});

describe('plan links', () => {
  it('keeps the overview and day ids on the paths whose routes read the switch', () => {
    expect(hrefFor('3e-1', { tripId: TRIP })).toBe(`/${TRIP}/plan`);
    expect(hrefFor('3e-2', { tripId: TRIP, day: '3' })).toEqual({
      pathname: '/[tripId]/day/[day]',
      params: { tripId: TRIP, day: '3' },
    });
    // A push or inbox link to the plan or a day forwards to those same paths.
    expect(tripLinkTarget(TRIP, ['plan'], {})).toBe(`/${TRIP}/plan`);
    expect(tripLinkTarget(TRIP, ['day', '3'], { item: 'x' })).toBe(`/${TRIP}/day/3?item=x`);
  });

  it('resolves the section 7 ids to the trip map, the day plan, its map and all days', () => {
    expect(hrefFor('7a-2', { tripId: TRIP, day: '3' })).toEqual({
      pathname: '/[tripId]/plan/map',
      params: { tripId: TRIP, day: '3', sheet: 'half' },
    });
    expect(hrefFor('7a-3', { tripId: TRIP })).toEqual({
      pathname: '/[tripId]/plan/map',
      params: { tripId: TRIP, sheet: 'full' },
    });
    expect(hrefFor('7b-1', { tripId: TRIP, day: '3' })).toEqual({
      pathname: '/[tripId]/day/[day]',
      params: { tripId: TRIP, day: '3' },
    });
    expect(hrefFor('7b-2', { tripId: TRIP, day: '3' })).toEqual({
      pathname: '/[tripId]/day/[day]/map',
      params: { tripId: TRIP, day: '3' },
    });
    expect(hrefFor('7b-3', { tripId: TRIP })).toEqual({
      pathname: '/[tripId]/plan/days',
      params: { tripId: TRIP },
    });
    expect(hrefFor('7i-1', { tripId: TRIP })).toEqual({
      pathname: '/[tripId]/plan/map',
      params: { tripId: TRIP },
    });
  });

  it('reads a link’s sheet and day, and falls back on anything else', () => {
    expect(sheetParam('full')).toBe('full');
    expect(sheetParam('sideways')).toBe('peek');
    expect(sheetParam(undefined)).toBe('peek');
    expect(dayParam('4')).toBe(4);
    expect(dayParam('0')).toBeNull();
    expect(dayParam('x')).toBeNull();
  });
});
