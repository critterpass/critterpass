/**
 * The day's rain window from the hourly forecast (P15 `weather_snapshots.hourly`): the longest run
 * of hours likely to be wet (60 % chance or 1 mm and up), as local minutes on the day. No snapshot
 * means the forecast is unavailable (too far out, or offline before it ever synced).
 */
import type { WeatherHour } from '@cp/domain';

import { minutesOnDay } from '../day/plan-model';

const WET_CHANCE = 60;
const WET_MM = 1;

export type RainForecast =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'dry' }
  | { readonly kind: 'rain'; readonly start: number; readonly end: number };

function isWet(hour: WeatherHour): boolean {
  return hour.chance_of_rain >= WET_CHANCE || hour.precip_mm >= WET_MM;
}

export function rainWindow(hourly: string | null, tz: string, date: string): RainForecast {
  if (hourly === null) return { kind: 'unavailable' };
  let hours: WeatherHour[];
  try {
    const body = JSON.parse(hourly) as { hours?: WeatherHour[] };
    hours = Array.isArray(body.hours) ? body.hours : [];
  } catch {
    return { kind: 'unavailable' };
  }
  if (hours.length === 0) return { kind: 'unavailable' };
  let best: { start: number; end: number } | null = null;
  let run: { start: number; end: number } | null = null;
  for (const hour of [...hours].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const minute = minutesOnDay(hour.at, tz, date);
    if (!isWet(hour)) {
      run = null;
      continue;
    }
    run =
      run !== null && run.end === minute
        ? { start: run.start, end: minute + 60 }
        : { start: minute, end: minute + 60 };
    if (best === null || run.end - run.start > best.end - best.start) best = run;
  }
  return best === null ? { kind: 'dry' } : { kind: 'rain', ...best };
}
