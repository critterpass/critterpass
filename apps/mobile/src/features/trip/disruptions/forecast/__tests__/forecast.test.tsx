/**
 * The forecast screen: the watch list in impact order whatever order the rows arrive in, only a
 * PLAN B row with an open decision opens the storm vote, a stale check and an all-clear list say
 * so, and the day strip reads its numbers from the newest snapshot of each date from today on.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { ForecastReady } from '../../../premium/day-change/ForecastPremium';
import { checkedLabel } from '../copy';
import { forecastDays, forecastModel, standoutDay, type WatchRowData } from '../model';
import { FORECAST_FIXTURES } from '../test-support/forecast-fixtures';
import type { ForecastViewProps } from '../view-types';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{node}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

const row = (
  id: string,
  status: string,
  score: number,
  poll: string | null = null,
): WatchRowData => ({
  id,
  kind: 'marine',
  day: '2026-10-16',
  status,
  score,
  title: id,
  detail: '',
  i18n: null,
  checked_at: '2026-10-14T00:00:00Z',
  poll_id: poll,
  disruption_id: null,
});

describe('forecast model', () => {
  it('orders the watch list by impact: plan B, watching, set, go', () => {
    const model = forecastModel(
      [],
      [row('go', 'go', 99), row('set', 'set', 5), row('b', 'plan_b', 1), row('w', 'watching', 50)],
      '2026-10-14',
      new Date('2026-10-14T01:00:00Z'),
    );
    expect(model.watch.map((entry) => entry.row.id)).toEqual(['b', 'w', 'set', 'go']);
    expect(model.allClear).toBe(false);
    expect(model.stale).toBe(false);
  });

  it('is stale after three hours without a check, and all clear with only GO and SET', () => {
    const model = forecastModel(
      [],
      [row('go', 'go', 1), row('set', 'set', 1), row('odd', 'unknown', 1)],
      '2026-10-14',
      new Date('2026-10-14T03:01:00Z'),
    );
    expect(model.stale).toBe(true);
    expect(model.allClear).toBe(true);
    expect(model.watch).toHaveLength(2);
  });

  it('takes the newest snapshot of each day from today on', () => {
    const hourly = (high: number) =>
      JSON.stringify({ day: { max_temp_c: high, chance_of_rain: 70 } });
    const days = forecastDays(
      [
        { date: '2026-10-13', hourly: hourly(20) },
        { date: '2026-10-14', hourly: hourly(31) },
        { date: '2026-10-14', hourly: hourly(25) },
        { date: '2026-10-15', hourly: '{broken' },
      ],
      '2026-10-14',
    );
    expect(days.map((d) => [d.date, d.highC, d.today, d.wet])).toEqual([
      ['2026-10-14', 31, true, true],
      ['2026-10-15', null, false, false],
    ]);
  });
});

const propsOf = (name: string): ForecastViewProps =>
  (FORECAST_FIXTURES[name] as () => ForecastViewProps)();

describe('forecast strip', () => {
  const day = (date: string, rainPct: number) => ({
    date,
    today: false,
    highC: 28,
    rainPct,
    wet: rainPct >= 50,
    hours: [],
  });
  it('inverts only the wettest wet day, the earliest on a tie', () => {
    expect(standoutDay([day('2026-11-04', 80), day('2026-11-05', 68), day('2026-11-06', 12)])).toBe(
      '2026-11-04',
    );
    expect(standoutDay([day('2026-11-04', 60), day('2026-11-05', 90)])).toBe('2026-11-05');
    expect(standoutDay([day('2026-11-04', 70), day('2026-11-05', 70)])).toBe('2026-11-04');
    expect(standoutDay([day('2026-11-04', 10)])).toBeNull();
  });
});

describe('forecast screen', () => {
  it('opens the storm vote only from a Plan B row with an open decision', async () => {
    const onOpenStorm = jest.fn();
    const props = propsOf('3k-7');
    await show(<ForecastReady props={{ ...props, onOpenStorm }} />);
    expect(screen.getByText('Plan B')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('forecast-watch-batur'));
    expect(onOpenStorm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('forecast-watch-seas'));
    expect(onOpenStorm).toHaveBeenCalledWith('storm-vote');
    expect(checkedLabel(props.model.checkedAt, props.tz, props.model.stale, 'en')).toBe(
      'CHECKED 07:30',
    );
  });

  it('says when the check is stale, when all is clear and when there is no forecast yet', async () => {
    const stale = propsOf('3k-7-stale');
    await show(<ForecastReady props={stale} />);
    expect(
      screen.getByText("I couldn't check in the last three hours. This is the last I saw."),
    ).toBeTruthy();
    expect(checkedLabel(stale.model.checkedAt, stale.tz, stale.model.stale, 'en')).toBe(
      'LAST CHECKED 07:30',
    );
    await show(<ForecastReady props={propsOf('3k-7-all-clear')} />);
    expect(screen.queryByText('Plan B')).toBeNull();
    // All clear is said above the GO and SET rows it is made of.
    expect(screen.getByTestId('forecast-all-clear')).toBeTruthy();
    expect(screen.getByTestId('forecast-watch-batur')).toBeTruthy();
    expect(
      screen.queryByText("I couldn't check in the last three hours. This is the last I saw."),
    ).toBeNull();
    await show(<ForecastReady props={propsOf('3k-7-no-forecast')} />);
    expect(screen.getAllByTestId('forecast-all-clear').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('forecast-days')).toBeNull();
    expect(screen.getByTestId('forecast-no-days')).toBeTruthy();
  });
});
