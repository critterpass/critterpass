/** "← TRIP" pops to the trip map under the day plan, however many screens lie between. */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-router', () => ({ router: {}, useNavigation: jest.fn() }));

import { backTargetOf } from '../back-to-trip';

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
