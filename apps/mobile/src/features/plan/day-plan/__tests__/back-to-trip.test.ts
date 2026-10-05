/** "← TRIP" pops to the trip map under the day plan, however many screens lie between. */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-router', () => ({ router: {}, useNavigation: jest.fn() }));

import { backTargetOf, popsToTripMap } from '../back-to-trip';

describe('how far "← TRIP" pops', () => {
  it('pops one screen from a day opened on the trip map', () => {
    expect(popsToTripMap(['plan/index', 'day/[day]/index'], 1)).toBe(1);
  });

  it('pops past the open day map, all days and a second day to the same trip map', () => {
    const stack = ['plan/map', 'day/[day]/index', 'day/[day]/map', 'plan/days', 'day/[day]/index'];
    expect(popsToTripMap(stack, 4)).toBe(4);
    expect(popsToTripMap(stack, 2)).toBe(2);
  });

  it('stops at the nearest trip map when there are two', () => {
    expect(popsToTripMap(['plan/index', 'search/index', 'plan/map', 'day/[day]/index'], 3)).toBe(1);
  });

  it('has no trip map to pop to when the day was opened from elsewhere', () => {
    expect(popsToTripMap(['day/[day]/index'], 0)).toBeNull();
    expect(popsToTripMap(['explore/index', 'day/[day]/index'], 1)).toBeNull();
  });
});

describe('backTargetOf', () => {
  it('passes the plan views stacked on the day and names what is under them', () => {
    const stack = [
      'plan/index',
      'plan/days',
      'day/[day]/index',
      'day/[day]/map',
      'day/[day]/index',
    ];
    expect(backTargetOf(stack, 4, null)).toEqual({ target: 'tripMap', pops: 4 });
    expect(backTargetOf(['draft/index', 'day/[day]/index'], 1, null)).toEqual({
      target: 'draft',
      pops: 1,
    });
    expect(backTargetOf(['search/index', 'day/[day]/index'], 1, null)).toEqual({
      target: 'screen',
      pops: 1,
    });
  });

  it('goes back out to today on the trip or its hub when the day was opened from there', () => {
    expect(backTargetOf(['day/[day]/index'], 0, '(tabs)/trips/[tripId]/day/[date]')).toEqual({
      target: 'today',
      pops: null,
    });
    expect(backTargetOf(['day/[day]/index'], 0, '(tabs)/trips/[tripId]/index')).toEqual({
      target: 'hub',
      pops: null,
    });
  });
});
