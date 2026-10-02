/**
 * Lab scenes for the forecast screen (3k-7): Bali from Wednesday with rough seas on Friday's
 * boat, then the other states (all clear, stale, offline, no forecast yet, a long trip, loading).
 * The names are the scene ids the device sheets pair with renders.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { ForecastView, type ForecastViewProps } from '../forecast-view';
import { forecastModel, type SnapshotRow, type WatchRowData } from '../model';

const NOW = new Date('2026-10-14T07:30:00+08:00');
const TODAY = '2026-10-14';
const noop = () => undefined;

function snapshot(date: string, high: number, rain: number): SnapshotRow {
  const hours = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => ({
    at: `${date}T${String(h).padStart(2, '0')}:00:00+08:00`,
    temp_c: high - Math.abs(13 - h) / 2,
    chance_of_rain: rain,
  }));
  return {
    date,
    hourly: JSON.stringify({ day: { max_temp_c: high, chance_of_rain: rain }, hours }),
  };
}

const WEEK: SnapshotRow[] = [
  snapshot('2026-10-14', 31, 10),
  snapshot('2026-10-15', 30, 20),
  snapshot('2026-10-16', 28, 70),
  snapshot('2026-10-17', 30, 20),
  snapshot('2026-10-18', 31, 10),
  snapshot('2026-10-19', 31, 10),
];
const THEMES: Readonly<Record<string, string>> = {
  '2026-10-14': 'UBUD',
  '2026-10-15': 'BATUR',
  '2026-10-16': 'BOAT',
  '2026-10-17': 'FREE',
  '2026-10-18': 'ULUWATU',
  '2026-10-19': 'FLY',
};

const watch = (
  fields: Partial<WatchRowData> & Pick<WatchRowData, 'id' | 'kind' | 'status' | 'title' | 'detail'>,
): WatchRowData => ({
  day: '2026-10-16',
  score: 50,
  i18n: null,
  checked_at: '2026-10-13T23:30:00Z',
  poll_id: null,
  disruption_id: null,
  ...fields,
});

const SEAS = watch({
  id: 'seas',
  kind: 'marine',
  status: 'plan_b',
  score: 90,
  title: 'Rough seas Friday',
  detail: 'Waves up to 2.5m. Fast boats to Penida might not run.',
  poll_id: 'storm-vote',
});
const CROWDS = watch({
  id: 'crowds',
  kind: 'crowds',
  status: 'watching',
  score: 60,
  day: '2026-10-14',
  title: 'Tegallalang busy today',
  detail: 'Busier than usual from 10:00. Keeping an eye on it.',
});
const BATUR = watch({
  id: 'batur',
  kind: 'volcano',
  status: 'go',
  score: 10,
  day: '2026-10-15',
  title: 'Batur tomorrow',
  detail: 'Clear at the summit, 80%. Alert level is normal.',
});
const WALK = watch({
  id: 'walk',
  kind: 'weather',
  status: 'set',
  score: 20,
  title: 'Ridge walk Friday',
  detail: 'Moved to 17:00, after the rain.',
});

function scene(
  snapshots: SnapshotRow[],
  rows: WatchRowData[],
  view: Partial<ForecastViewProps> = {},
  now = NOW,
) {
  return (
    <ForecastView
      state="ready"
      model={forecastModel(snapshots, rows, TODAY, now)}
      place="Bali"
      tz="Asia/Makassar"
      guide="tokek"
      offline={false}
      themeFor={(date) => THEMES[date] ?? null}
      wordsFor={(entry) => ({ title: entry.row.title, detail: entry.row.detail })}
      onBack={noop}
      onOpenStorm={noop}
      {...view}
    />
  );
}

const LONG = Array.from({ length: 12 }, (_, i) =>
  snapshot(`2026-10-${String(14 + i).padStart(2, '0')}`, 30 - (i % 3), (i * 17) % 90),
);

export const FORECAST_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-7': () => scene(WEEK, [BATUR, WALK, CROWDS, SEAS]),
  '3k-7-all-clear': () => scene(WEEK, [BATUR, WALK]),
  '3k-7-stale': () => scene(WEEK, [SEAS, BATUR], {}, new Date('2026-10-14T12:30:00+08:00')),
  '3k-7-offline': () => scene(WEEK, [SEAS, CROWDS, BATUR], { offline: true }),
  '3k-7-no-forecast': () => scene([], []),
  '3k-7-long-trip': () => scene(LONG, [SEAS, CROWDS]),
  '3k-7-loading': () => scene([], [], { state: 'loading' }),
};

export const FORECAST_SCENE_NAMES = Object.keys(FORECAST_SCENES);
