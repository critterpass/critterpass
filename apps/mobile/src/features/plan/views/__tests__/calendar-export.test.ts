/**
 * Calendar export: the write button only exists when the installed build's calendar module can
 * write; the events are my own timed items; the feed link has a webcal twin for the calendar app.
 */
import { describe, expect, it } from '@jest/globals';

import { BALI_ITEMS, BALI_TRIP, MAYA, RIN, WINSTON } from '../../overview/dev/bali-plan';
import { calendarWriter, feedUrls, myEvents } from '../data/calendar-export';

describe('calendar writer', () => {
  it('is there only when the native module has both write methods', () => {
    const write = {
      requestWriteAccess: () => Promise.resolve(true),
      writeEvents: () => Promise.resolve(1),
    };
    expect(calendarWriter(write)).toBe(write);
    expect(
      calendarWriter({ hasAccess: () => true, readBusyDays: () => Promise.resolve([]) }),
    ).toBeNull();
    expect(calendarWriter(null)).toBeNull();
  });
});

describe('my events', () => {
  it('keep the items I attend, with an hour for an open end', () => {
    const mine = myEvents(BALI_ITEMS, WINSTON, 'Asia/Makassar');
    expect(mine.map((event) => event.title)).not.toContain('Spa');
    expect(mine).toHaveLength(BALI_ITEMS.length - 1);
    const maya = myEvents(BALI_ITEMS, MAYA, 'Asia/Makassar').map((event) => event.title);
    expect(maya).toContain('Spa');
    const open = myEvents([{ ...BALI_ITEMS[0]!, endsAt: null, attendeeIds: [RIN] }], RIN, null);
    expect(Date.parse(open[0]!.endsAt) - Date.parse(open[0]!.startsAt)).toBe(60 * 60 * 1000);
  });
});

describe('feed link', () => {
  it('prefixes the api origin and swaps the scheme for the calendar app', () => {
    const path = `/v1/trips/${BALI_TRIP}/calendar.ics?token=abc`;
    expect(feedUrls({ trip_id: BALI_TRIP, path }, 'https://api.critterpass.app/')).toEqual({
      https: `https://api.critterpass.app${path}`,
      webcal: `webcal://api.critterpass.app${path}`,
    });
  });
});
