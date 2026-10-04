/**
 * The plan's ways out reach the check's screens through the registry with the params the trip map
 * and the day plan pass: a free slot gives its window as minutes of the day and sometimes only the
 * day's number; an issue gives its day id.
 */
import { describe, expect, it } from '@jest/globals';

import { hrefFor } from '@/lib/navigation/screen-registry';

import '../screens';

const TRIP = '00000000-0000-4000-8000-000000000001';
const DAY = '00000000-0000-4000-8000-000000000002';

describe('the check screens in the registry', () => {
  it('opens the plan check and the balance for a trip', () => {
    expect(hrefFor('7h-1', { tripId: TRIP })).toBe(`/${TRIP}/check`);
    expect(hrefFor('7h-5', { tripId: TRIP })).toBe(`/${TRIP}/check/balance`);
  });

  it('opens fill a gap from a free slot given in minutes, by day id or by day number', () => {
    expect(hrefFor('7h-2', { tripId: TRIP, day: '2', dayId: DAY, from: '960', to: '1140' })).toBe(
      `/${TRIP}/check/gap?dayId=${DAY}&day=2&start=16%3A00&end=19%3A00`,
    );
    expect(hrefFor('7h-2', { tripId: TRIP, day: '2', from: '960', to: '1140' })).toBe(
      `/${TRIP}/check/gap?dayId=&day=2&start=16%3A00&end=19%3A00`,
    );
  });

  it("opens an issue's fixer on its day, or the plan check when there is no day", () => {
    const issue = { tripId: TRIP, issueId: 'x', day: '2', dayId: DAY };
    expect(hrefFor('7h-3', issue)).toBe(`/${TRIP}/check/less-driving/${DAY}`);
    expect(hrefFor('7h-4', issue)).toBe(`/${TRIP}/check/rain/${DAY}`);
    expect(hrefFor('7h-4', { tripId: TRIP, issueId: 'x', day: '2' })).toBe(`/${TRIP}/check`);
  });
});
