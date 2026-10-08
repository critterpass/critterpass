/**
 * The forecast screen: the watch list in impact order whatever order the rows arrive in, only a
 * PLAN B row with an open decision opens the storm vote, a stale check and an all-clear list say
 * so, and the day strip reads its numbers from the newest snapshot of each date from today on.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { FORECAST_SCENES } from '../dev/forecast-scenes';
import { ForecastView } from '../forecast-view';
import { forecastDays, forecastModel, type WatchRowData } from '../model';

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

describe('forecast screen', () => {
  it('opens the storm vote only from a PLAN B row with an open decision', async () => {
    const onOpenStorm = jest.fn();
    const base = (FORECAST_SCENES['3k-7'] as () => { props: Parameters<typeof ForecastView>[0] })();
    await show(<ForecastView {...base.props} onOpenStorm={onOpenStorm} />);
    expect(screen.getByText('PLAN B')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('forecast-watch-seas'));
    expect(onOpenStorm).toHaveBeenCalledWith('storm-vote');
    expect(screen.getByText('CHECKED 07:30')).toBeTruthy();
  });

  it('says when the check is stale, when all is clear and when there is no forecast yet', async () => {
    await show((FORECAST_SCENES['3k-7-stale'] as () => ReactNode)());
    expect(screen.getByTestId('forecast-stale')).toBeTruthy();
    expect(screen.getByText('LAST CHECKED 07:30')).toBeTruthy();
    await show((FORECAST_SCENES['3k-7-all-clear'] as () => ReactNode)());
    expect(screen.getAllByTestId('forecast-all-clear').length).toBeGreaterThan(0);
    await show((FORECAST_SCENES['3k-7-no-forecast'] as () => ReactNode)());
    expect(screen.getAllByTestId('forecast-no-days').length).toBeGreaterThan(0);
  });
});
