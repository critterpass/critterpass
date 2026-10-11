import { describe, expect, it } from 'vitest';

import { nudgeSendNow } from '../send-time';

// 14:05 UTC is 21:05 in Ho Chi Minh City.
const NOW = new Date('2026-10-11T14:05:00Z');
const TZ = 'Asia/Ho_Chi_Minh';

describe('a nudge sent now', () => {
  it('goes at once, stamped with the target’s local time', () => {
    expect(nudgeSendNow({ now: NOW, tz: TZ, quiet: null })).toEqual({
      at: NOW,
      local: '2026-10-11T21:05',
    });
  });

  it('waits for their hour inside quiet hours, including hours that wrap midnight', () => {
    expect(nudgeSendNow({ now: NOW, tz: TZ, quiet: { from: '21:00', to: '07:00' } })).toBeNull();
    expect(
      nudgeSendNow({ now: NOW, tz: TZ, quiet: { from: '22:00', to: '07:00' } }),
    ).not.toBeNull();
  });

  it('waits when the target already has the day’s nudges', () => {
    expect(
      nudgeSendNow({ now: NOW, tz: TZ, quiet: null, fullDates: new Set(['2026-10-11']) }),
    ).toBeNull();
  });
});
