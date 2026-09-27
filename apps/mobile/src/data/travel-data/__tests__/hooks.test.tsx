/**
 * The hooks end to end: fares from the api then from the last good copy once offline; weather and
 * crowds straight from the synced trip pack (encrypted local database) without asking the api;
 * and the api's `missing` answer when nothing covers the place.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { TravelDataReaderProvider, type TravelDataReader } from '../client';
import { recordedReader } from '../test-support/recorded-reader';
import { useCrowds } from '../useCrowds';
import { useFares } from '../useFares';
import { useWeather } from '../useWeather';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

function withReader(reader: TravelDataReader, inner?: TestLocalFirst['wrapper']) {
  return ({ children }: { children: ReactNode }) => (
    <TravelDataReaderProvider value={reader}>
      {inner === undefined ? children : inner({ children })}
    </TravelDataReaderProvider>
  );
}

describe('useFares', () => {
  it('reads the api, then serves the last good copy as stale when offline', async () => {
    const reader = recordedReader({ '/v1/fares': [200, 'fares-bali-2026-11'] });
    const input = { origins: ['SIN', 'KUL', 'HAN'], dest: 'bali', month: '2026-11' };
    const first = await renderHook(() => useFares(input), { wrapper: withReader(reader) });
    await waitFor(() => expect(first.result.current.status).toBe('ok'));
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useFares(input), { wrapper: withReader(reader) });
    await waitFor(() => expect(second.result.current.status).toBe('stale'));
    expect(second.result.current).toMatchObject({ source: 'cache', reason: 'offline' });
  });

  it('is missing without a destination, and asks nothing', async () => {
    const reader = recordedReader({});
    const { result } = await renderHook(
      () => useFares({ origins: ['SIN'], dest: null, month: '2026-11' }),
      { wrapper: withReader(reader) },
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'missing', reason: 'no_data' }));
    expect(reader.paths).toEqual([]);
  });
});

const DEST = '0192f000-0000-7000-8000-00000000d001';
const POI = '0192f000-0000-7000-8000-00000000a001';
const BASE = Date.parse('2026-10-01T16:00:00Z');

async function syncedBali(stack: TestLocalFirst, fetchedAt: Date, checkedAt: Date) {
  const hours = Array.from({ length: 24 }, (_, index) => ({
    at: new Date(BASE + index * 3_600_000).toISOString(),
    temp_c: 25,
    chance_of_rain: index === 8 ? 70 : 10,
    precip_mm: 0,
    wind_kph: 8,
    gust_kph: 12,
    uv: 4,
    code: 1000,
    is_day: true,
  }));
  const body = {
    day: { max_temp_c: 29, min_temp_c: 23, chance_of_rain: 70, precip_mm: 3, uv: 10, code: 1063 },
    hours,
  };
  await stack.db.execute(
    'INSERT INTO destinations (id, slug, name, coverage) VALUES (?, ?, ?, ?)',
    [DEST, 'bali', 'Bali', 'live'],
  );
  await stack.db.execute(
    `INSERT INTO weather_snapshots (id, destination_id, point_key, lat, lng, elevation_m, date,
       hourly, source, fetched_at, checked_at)
     VALUES (?, ?, 'centroid', -8.5069, 115.2625, 200, '2026-10-02', ?, 'weatherapi', ?, ?)`,
    [
      '0192f000-0000-7000-8000-00000000b001',
      DEST,
      JSON.stringify(body),
      fetchedAt.toISOString(),
      checkedAt.toISOString(),
    ],
  );
}

describe('useWeather', () => {
  it('answers from the synced trip pack without asking the api', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    const now = new Date(BASE + 3_600_000);
    await syncedBali(stack, new Date(BASE), new Date(BASE));
    const reader = recordedReader({});
    const window = {
      lat: -8.51,
      lng: 115.26,
      from: new Date(BASE + 7 * 3_600_000),
      to: new Date(BASE + 9 * 3_600_000),
    };
    const { result } = await renderHook(() => useWeather(window, () => now), {
      wrapper: withReader(reader, stack.wrapper),
    });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current).toMatchObject({ source: 'synced' });
    const data = result.current.status === 'ok' ? result.current.data : undefined;
    expect(data?.hourly.map((hour) => hour.chance_of_rain)).toEqual([10, 70, 10]);
    expect(reader.paths).toEqual([]);
  });

  it('marks a synced forecast whose last refresh failed as stale', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await syncedBali(stack, new Date(BASE), new Date(BASE + 3_600_000));
    const window = {
      lat: -8.51,
      lng: 115.26,
      from: new Date(BASE),
      to: new Date(BASE + 3_600_000),
    };
    const { result } = await renderHook(
      () => useWeather(window, () => new Date(BASE + 2 * 3_600_000)),
      { wrapper: withReader(recordedReader({}), stack.wrapper) },
    );
    await waitFor(() => expect(result.current.status).toBe('stale'));
    expect(result.current).toMatchObject({ source: 'synced', reason: 'refresh_failed' });
  });

  it('asks the api when nothing synced covers the place, and reports its missing answer', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    const reader = recordedReader({ '/v1/weather': [200, 'weather-none'] });
    const window = { lat: 35, lng: 135.7, from: new Date(BASE), to: new Date(BASE + 3_600_000) };
    const { result } = await renderHook(() => useWeather(window), {
      wrapper: withReader(reader, stack.wrapper),
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'missing', reason: 'no_data' }));
    expect(reader.paths).toHaveLength(1);
  });
});

describe('useCrowds', () => {
  it('reads the month level from the synced catalogue for a place in the trip pack', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await stack.db.execute(
      `INSERT INTO pois (id, destination_id, name, category, lat, lng, hours)
       VALUES (?, ?, 'Tirta Empul', 'temple_shrine', -8.415, 115.315, ?)`,
      [POI, DEST, JSON.stringify({ weekly: { mo: [{ start: '08:00', end: '18:00' }] } })],
    );
    await stack.db.execute(
      `INSERT INTO season_months (id, destination_id, month, crowd_index, colour_role,
         highlight_tag, source, sourced_on, reviewed_at)
       VALUES (?, ?, 7, 100, 'peak', 'JUL PEAK', 'BPS Bali arrivals', '2026-09-28', ?)`,
      ['0192f000-0000-7000-8000-00000000c001', DEST, '2026-09-28T00:00:00.000Z'],
    );
    const reader = recordedReader({});
    const { result } = await renderHook(() => useCrowds({ poiId: POI, date: '2027-07-05' }), {
      wrapper: withReader(reader, stack.wrapper),
    });
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current).toMatchObject({
      source: 'synced',
      data: {
        hourly: null,
        best_window: null,
        month: { month: 7, crowd_index: 100, colour_role: 'peak', highlight_tag: 'JUL PEAK' },
        curve_source: 'BPS Bali arrivals',
      },
    });
    expect(reader.paths).toEqual([]);
  });
});
