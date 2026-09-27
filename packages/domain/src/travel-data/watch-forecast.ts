/**
 * `watchForecast`: the pure diff between the previous and the new forecast for a trip's plan items,
 * reporting only material changes (docs: "precip ≥50 % flips on an outdoor item, wave ≥2.0 m on a
 * boat item, temp extremes"). A change is material when a threshold is newly crossed over an
 * item's hours; the same forecast twice, or a forecast that was already past the threshold, yields
 * nothing, so reruns never repeat an event. `hazardImpact` scores a hazard level move the same way.
 */
import type { ForecastChange, ForecastChangeReason } from './events';
import type { HazardLevel, MarineHour, WeatherHour } from './types';

export const RAIN_CHANCE_THRESHOLD = 50;
export const WAVE_HEIGHT_THRESHOLD_M = 2;
export const HEAT_THRESHOLD_C = 35;
export const COLD_THRESHOLD_C = 0;

export interface WatchedItem {
  readonly stable_id: string;
  /** Instant the item starts; it is watched for its duration, or one hour without an end. */
  readonly starts_at: string;
  readonly ends_at: string | null;
  /** Local date of the item (`YYYY-MM-DD`), reported with the change. */
  readonly local_date: string;
  readonly is_outdoor: boolean;
  readonly is_marine: boolean;
}

export interface ForecastPair {
  readonly previousWeather: readonly WeatherHour[];
  readonly nextWeather: readonly WeatherHour[];
  readonly previousMarine: readonly MarineHour[];
  readonly nextMarine: readonly MarineHour[];
}

export interface ForecastWatchResult {
  readonly changes: readonly ForecastChange[];
  /** 0–100: share of watched items that changed materially. */
  readonly impact: number;
}

const HOUR_MS = 3_600_000;

function during<T extends { at: string }>(hours: readonly T[], item: WatchedItem): T[] {
  const start = Date.parse(item.starts_at);
  const end = item.ends_at === null ? start + HOUR_MS : Date.parse(item.ends_at);
  // An hour counts when it overlaps the item, so a 09:30 start reads the 09:00 hour.
  return hours.filter((hour) => {
    const at = Date.parse(hour.at);
    return at + HOUR_MS > start && at < end;
  });
}

function peak<T>(hours: readonly T[], value: (hour: T) => number): number | null {
  return hours.length === 0 ? null : Math.max(...hours.map(value));
}

function low<T>(hours: readonly T[], value: (hour: T) => number): number | null {
  return hours.length === 0 ? null : Math.min(...hours.map(value));
}

/** True when `next` crosses the threshold and `previous` (if known) did not. */
function newlyAbove(previous: number | null, next: number | null, threshold: number): boolean {
  return next !== null && next >= threshold && (previous === null || previous < threshold);
}

function newlyBelow(previous: number | null, next: number | null, threshold: number): boolean {
  return next !== null && next <= threshold && (previous === null || previous > threshold);
}

export function watchForecast(
  forecast: ForecastPair,
  items: readonly WatchedItem[],
): ForecastWatchResult {
  const changes: ForecastChange[] = [];
  let watched = 0;
  const touched = new Set<string>();
  const add = (item: WatchedItem, reason: ForecastChangeReason) => {
    changes.push({ item_stable_id: item.stable_id, reason, date: item.local_date });
    touched.add(item.stable_id);
  };

  for (const item of items) {
    if (!item.is_outdoor && !item.is_marine) continue;
    watched += 1;
    const before = during(forecast.previousWeather, item);
    const after = during(forecast.nextWeather, item);
    if (item.is_outdoor && after.length > 0) {
      const rainBefore = peak(before, (hour) => hour.chance_of_rain);
      const rainAfter = peak(after, (hour) => hour.chance_of_rain);
      if (newlyAbove(rainBefore, rainAfter, RAIN_CHANCE_THRESHOLD)) add(item, 'rain');
      const hotBefore = peak(before, (hour) => hour.temp_c);
      if (
        newlyAbove(
          hotBefore,
          peak(after, (hour) => hour.temp_c),
          HEAT_THRESHOLD_C,
        )
      ) {
        add(item, 'heat');
      }
      const coldBefore = low(before, (hour) => hour.temp_c);
      if (
        newlyBelow(
          coldBefore,
          low(after, (hour) => hour.temp_c),
          COLD_THRESHOLD_C,
        )
      ) {
        add(item, 'cold');
      }
    }
    if (item.is_marine) {
      const wavesBefore = peak(during(forecast.previousMarine, item), (hour) => hour.wave_m);
      const wavesAfter = peak(during(forecast.nextMarine, item), (hour) => hour.wave_m);
      if (newlyAbove(wavesBefore, wavesAfter, WAVE_HEIGHT_THRESHOLD_M)) add(item, 'waves');
    }
  }
  return {
    changes,
    impact: watched === 0 ? 0 : Math.min(100, Math.round((touched.size / watched) * 100)),
  };
}

/** 0–100 for a hazard level move: rising levels weigh by how high they reach; easing is low. */
export function hazardImpact(from: HazardLevel | null, to: HazardLevel): number {
  if (from !== null && to < from) return 20;
  if (to >= 4) return 100;
  if (to === 3) return 75;
  return to === 2 ? 50 : 10;
}
