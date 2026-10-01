jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { router } from 'expo-router';

import { loadCatalog } from '@cp/i18n';

import { hubEntries } from '../hub-next';
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

function entries(today: string, over: Partial<Parameters<typeof hubEntries>[0]> = {}) {
  return hubEntries({
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

const labels = (today: string) => entries(today).map((entry) => entry.label);

describe('hub entry rows', () => {
  it("names the day of a stop that is not today's, after a row for today", async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'trip/hub') });
    expect(labels('2026-10-03')).toEqual(['Next up · 10:00']);
    expect(labels('2026-10-02')).toEqual(['Today · Oct 2', 'Tomorrow · 10:00']);
    expect(labels('2026-10-01')).toEqual(['Today · Oct 1', 'Oct 3 · 10:00']);
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'trip/hub') });
    expect(labels('2026-10-02')[1]).toBe('Ngày mai · 10:00');
  });

  it("opens today's page from today's row and the stop's own day from the stop", async () => {
    i18n.loadAndActivate({ locale: 'en', messages: await loadCatalog('en', 'trip/hub') });
    const [today, stop] = entries('2026-10-02');
    today?.onPress?.();
    expect(router.push).toHaveBeenLastCalledWith(tripDayRoute('t1', null));
    stop?.onPress?.();
    expect(router.push).toHaveBeenLastCalledWith(tripDayRoute('t1', '2026-10-03'));
    // The last evening, with no stop left at all, still has today's page.
    expect(entries('2026-10-04', { nextItem: null }).map((entry) => entry.testID)).toEqual([
      'trip-hub-today',
    ]);
  });

  it("puts today's leave-by first, with its time on the leave-by's clock", () => {
    const rows = entries('2026-10-03', {
      leaveBy: { id: 'l', leave_at: '2026-10-02T21:55:00Z', tz: 'Asia/Saigon', place_name: null },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: 'Leave by · 04:55',
      title: 'Early start',
      tone: 'pink',
    });
  });
});
