jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { router } from 'expo-router';

import { loadCatalog } from '@cp/i18n';

import { hubNext } from '../hub-next';
import { tripDayRoute } from '../routes';

const STOP = {
  stable_id: 's1',
  starts_at: '2026-10-03T03:00:00Z',
  tz: 'Asia/Saigon',
  notes: null,
  category: null,
  poi_name: 'Chợ Cồn',
  day_date: '2026-10-03',
};

function next(today: string, over: Partial<Parameters<typeof hubNext>[0]> = {}) {
  return hubNext({
    header: { phase: 'in', day: 1, days: 3 },
    tripId: 't1',
    startDate: '2026-10-02',
    leaveBy: null,
    nextItem: STOP,
    today,
    tz: 'Asia/Saigon',
    locale: i18n.locale,
    ...over,
  });
}

describe('hub entry row', () => {
  it("names the day of a stop that is not today's", async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'trip/hub') });
    expect(next('2026-10-03')?.label).toBe('Next up · 10:00');
    expect(next('2026-10-02')?.label).toBe('Tomorrow · 10:00');
    expect(next('2026-10-01')?.label).toBe('Oct 3 · 10:00');
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'trip/hub') });
    expect(next('2026-10-02')?.label).toBe('Ngày mai · 10:00');
  });

  it('opens the day the stop is on', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'trip/hub') });
    next('2026-10-02')?.onPress();
    expect(router.push).toHaveBeenCalledWith(tripDayRoute('t1', '2026-10-03'));
  });

  it("puts today's leave-by before the next stop, with its time on the leave-by's clock", () => {
    const row = next('2026-10-03', {
      leaveBy: { id: 'l', leave_at: '2026-10-02T21:55:00Z', tz: 'Asia/Saigon', place_name: null },
    });
    expect(row).toMatchObject({ label: 'Leave by · 04:55', title: 'Early start', tone: 'pink' });
  });
});
