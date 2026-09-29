jest.mock('../src/CpCalendarModule', () => ({
  nativeCpCalendarModule: { hasAccess: jest.fn(() => true), readBusyDays: jest.fn() },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { hasCalendarAccess, isDeviceCalendarAvailable, readBusyDays } from '../index';
import { nativeCpCalendarModule, type NativeDayState } from '../src/CpCalendarModule';

/** The native reduction is the boundary: EventKit and CalendarContract cannot run under Jest. */
const native = nativeCpCalendarModule as unknown as {
  readonly readBusyDays: jest.Mock<(...args: unknown[]) => Promise<NativeDayState[]>>;
};
const range = { from: '2027-04-01', to: '2027-04-03', tz: 'Asia/Tokyo' };

describe('cp-calendar', () => {
  it('is available and reports access when the module is linked', () => {
    expect(isDeviceCalendarAvailable()).toBe(true);
    expect(hasCalendarAccess()).toBe(true);
  });

  it('passes the range through and keeps only date and state', async () => {
    native.readBusyDays.mockResolvedValueOnce([
      { date: '2027-04-01', state: 'free' },
      { date: '2027-04-02', state: 'busy', title: 'Dentist' } as NativeDayState,
      { date: '2027-04-03', state: 'maybe' },
    ]);
    await expect(readBusyDays(range, true)).resolves.toEqual([
      { date: '2027-04-01', state: 'free' },
      { date: '2027-04-02', state: 'busy' },
      { date: '2027-04-03', state: 'maybe' },
    ]);
    expect(native.readBusyDays).toHaveBeenLastCalledWith(
      '2027-04-01',
      '2027-04-03',
      'Asia/Tokyo',
      true,
    );
  });

  it('drops malformed rows, and maybe days unless tentative is shared', async () => {
    native.readBusyDays.mockResolvedValueOnce([
      { date: '2027-04-01', state: 'maybe' },
      { date: 'April 2', state: 'busy' },
      { date: '2027-04-03', state: 'unknown' },
    ]);
    await expect(readBusyDays(range, false)).resolves.toEqual([]);
  });
});
