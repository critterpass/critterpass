/**
 * Pure helpers the server uses to fill the widget snapshot's smaller fields from rows it reads:
 * the forecast line for the rest of the day, and the short forms of names a widget may show (a
 * first name for the balance nudge, an initial for a crew dot; never a full name).
 */
import type { WeatherHour } from '../travel-data/types';
import { RAIN_CHANCE_THRESHOLD } from '../travel-data/watch-forecast';
import type { WidgetSnapshot } from './widget-snapshot';

type Forecast = NonNullable<NonNullable<WidgetSnapshot['today']>['forecast']>;

/** WeatherAPI condition codes with thunder in them. */
const THUNDER_CODES: ReadonlySet<number> = new Set([1087, 1273, 1276, 1279, 1282]);
/** Cloud, mist and fog: anything but clear without rain. */
const CLEAR_CODES: ReadonlySet<number> = new Set([1000, 1003]);

const likelyRain = (hour: WeatherHour) =>
  hour.chance_of_rain >= RAIN_CHANCE_THRESHOLD || hour.precip_mm >= 0.5;

/**
 * The rest of the day from `now`: the highest temperature, what the sky mostly does, and the first
 * hour rain is likely. Null when no hour of the rest of the day is known.
 */
export function widgetForecast(hours: readonly WeatherHour[], now: Date): Forecast | null {
  const ahead = hours.filter((hour) => Date.parse(hour.at) + 3_600_000 > now.getTime());
  if (ahead.length === 0) return null;
  const rain = ahead.find(likelyRain);
  const condition: Forecast['condition'] = ahead.some((hour) => THUNDER_CODES.has(hour.code))
    ? 'storm'
    : rain !== undefined
      ? 'rain'
      : ahead.filter((hour) => CLEAR_CODES.has(hour.code)).length * 2 >= ahead.length
        ? 'clear'
        : 'cloudy';
  return {
    temp_max_c: Math.round(Math.max(...ahead.map((hour) => hour.temp_c))),
    condition,
    rain_from: rain === undefined ? null : new Date(rain.at).toISOString(),
  };
}

/** The first word of a display name, at most 24 characters; null when there is none. */
export function widgetFirstName(displayName: string | null): string | null {
  const first = [...((displayName ?? '').trim().split(/\s+/u)[0] ?? '')].slice(0, 24).join('');
  return first === '' ? null : first;
}

/** One letter for a crew dot ("?" when the name is unknown). */
export function widgetInitial(displayName: string | null): string {
  const first = [...(displayName ?? '').trim()][0];
  return first === undefined ? '?' : first.toLocaleUpperCase();
}
