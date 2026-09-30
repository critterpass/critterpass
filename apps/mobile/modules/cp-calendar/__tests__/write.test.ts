jest.mock('../src/CpCalendarModule', () => ({
  nativeCpCalendarModule: {
    hasAccess: jest.fn(() => true),
    readBusyDays: jest.fn(),
    requestWriteAccess: jest.fn(() => Promise.resolve(true)),
    writeEvents: jest.fn((events: unknown[]) => Promise.resolve(events.length)),
  },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { canWriteCalendar, requestCalendarWriteAccess, writeCalendarEvents } from '../index';
import { nativeCpCalendarModule, type NativePlanEvent } from '../src/CpCalendarModule';

/** EventKit and CalendarContract cannot run under Jest: the native writer is the boundary. */
const native = nativeCpCalendarModule as unknown as {
  readonly writeEvents: jest.Mock<(events: NativePlanEvent[]) => Promise<number>>;
};

const walk: NativePlanEvent = {
  id: '0199b000-0000-7000-8000-000000000303',
  title: 'Ridge walk',
  startsAt: '2026-11-04T06:00:00.000Z',
  endsAt: '2026-11-04T08:30:00.000Z',
  tz: 'Asia/Makassar',
  notes: null,
};

describe('adding plan items to the calendar', () => {
  it('is offered when the build has the writer and asks through it', async () => {
    expect(canWriteCalendar()).toBe(true);
    await expect(requestCalendarWriteAccess()).resolves.toBe(true);
  });

  it('passes only well-formed events, with nothing but their own fields', async () => {
    const extra = { ...walk, id: 'x', attendees: ['Maya'] } as NativePlanEvent;
    await expect(
      writeCalendarEvents([
        walk,
        { ...walk, id: 'y', title: ' ' },
        { ...walk, id: 'z', endsAt: walk.startsAt },
        extra,
      ]),
    ).resolves.toBe(2);
    expect(native.writeEvents).toHaveBeenLastCalledWith([walk, { ...walk, id: 'x' }]);
  });
});
