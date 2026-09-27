/**
 * Hourly weather (`useWeather`) and sea conditions (`useMarine`) for a place and time window: from
 * the synced trip pack when the trip's forecast is on the device, else `/v1/weather[/marine]`.
 * `stale` when the server's last refresh failed ("CHECKED {time}" + stale badge) or the device is
 * offline with only the last good copy; `missing` when nothing covers the place (never invented).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import { useContext } from 'react';

import { LocalFirstContext } from '../powersync/local-first-context';
import type { Classification } from './client';
import type { ReadState, StaleReason } from './freshness';
import { readLocalMarine, readLocalWeather, type LocalWeatherWindow } from './local';
import { query, useTravelRead } from './use-travel-read';
import {
  marineResponseSchema,
  weatherResponseSchema,
  type MarineResponse,
  type WeatherResponse,
} from '@cp/domain';

export type UseWeatherInput = LocalWeatherWindow;

function staleReason(data: { fetched_at: string | null; checked_at: string | null }): StaleReason {
  return data.checked_at !== null && data.fetched_at !== null && data.checked_at > data.fetched_at
    ? 'refresh_failed'
    : 'old';
}

export function classifyForecast(data: WeatherResponse | MarineResponse): Classification {
  if (data.hourly.length === 0) return { status: 'missing' };
  return data.stale
    ? { status: 'stale', seenAt: data.fetched_at, reason: staleReason(data) }
    : { status: 'ok', seenAt: data.fetched_at };
}

function windowQuery(input: UseWeatherInput): string {
  return query({
    lat: input.lat,
    lng: input.lng,
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    elevation_m: input.elevationM,
  });
}

/** A synced answer as a `ReadState`, or null to fall through to the api. */
export function syncedState<T extends WeatherResponse | MarineResponse>(
  data: T | null,
): ReadState<T> | null {
  if (data === null) return null;
  const classified = classifyForecast(data);
  if (classified.status === 'missing') return null;
  return classified.status === 'ok'
    ? { status: 'ok', data, seenAt: classified.seenAt, source: 'synced' }
    : {
        status: 'stale',
        data,
        seenAt: classified.seenAt,
        source: 'synced',
        reason: classified.reason,
      };
}

export function useWeather(
  input: UseWeatherInput | null,
  now?: () => Date,
): ReadState<WeatherResponse> {
  const local = useContext(LocalFirstContext);
  return useTravelRead({
    path: input === null ? null : `/v1/weather${windowQuery(input)}`,
    schema: weatherResponseSchema,
    classify: classifyForecast,
    ...(now !== undefined ? { now } : {}),
    ...(local === null || input === null
      ? {}
      : {
          local: async () =>
            syncedState(await readLocalWeather(local.db, input, now?.() ?? new Date())),
        }),
  });
}

export function useMarine(
  input: UseWeatherInput | null,
  now?: () => Date,
): ReadState<MarineResponse> {
  const local = useContext(LocalFirstContext);
  return useTravelRead({
    path: input === null ? null : `/v1/weather/marine${windowQuery(input)}`,
    schema: marineResponseSchema,
    classify: classifyForecast,
    ...(now !== undefined ? { now } : {}),
    ...(local === null || input === null
      ? {}
      : {
          local: async () =>
            syncedState(await readLocalMarine(local.db, input, now?.() ?? new Date())),
        }),
  });
}
