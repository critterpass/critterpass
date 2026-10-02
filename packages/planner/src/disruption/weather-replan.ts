/**
 * The weather replan solver (3e-2): when rain threatens an outdoor item, find the nearest dry slot
 * the same day that keeps its length, stays in daylight (07:00–18:30 local), leaves
 * {@link BUFFER_MIN} around the day's other items and is not a booking or must-do (those never
 * move on a forecast). A slot is dry when every hour it overlaps is below {@link DRY_PCT}. Later
 * slots win ties (after the rain passes: "Rain till three. Move the walk?"). No slot → no
 * suggestion.
 */
import { toLocalWallTime, type WeatherHour } from '@cp/domain';

export const DRY_PCT = 40;
export const WET_PCT = 60;
export const BUFFER_MIN = 30;
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 18 * 60 + 30;
const STEP_MIN = 30;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface ReplanItem {
  readonly stableId: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly locked: boolean;
}

export interface ReplanInput {
  readonly item: ReplanItem;
  /** The day's other timed items. */
  readonly others: readonly { readonly startsAt: Date; readonly endsAt: Date | null }[];
  readonly weather: readonly WeatherHour[];
  readonly tz: string;
}

export interface ReplanSuggestion {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** The wet window the move avoids (local times for the band on 3e-2). */
  readonly rainFrom: string;
  readonly rainTo: string;
  readonly facts: Readonly<Record<string, string | number>>;
}

const local = (at: Date, tz: string) => toLocalWallTime(at, tz).time.slice(0, 5);

function chanceOver(weather: readonly WeatherHour[], from: number, to: number): number {
  const hours = weather.filter((hour) => {
    const at = Date.parse(hour.at);
    return at + HOUR > from && at < to;
  });
  return hours.length === 0 ? Number.NaN : Math.max(...hours.map((hour) => hour.chance_of_rain));
}

function minutesOfDay(at: Date, tz: string): number {
  const [h = 0, m = 0] = local(at, tz).split(':').map(Number);
  return h * 60 + m;
}

export function suggestWeatherMove(input: ReplanInput): ReplanSuggestion | null {
  const { item, tz, weather } = input;
  if (item.locked) return null;
  const start = item.startsAt.getTime();
  const length = (item.endsAt?.getTime() ?? start + HOUR) - start;
  const wet = chanceOver(weather, start, start + length);
  if (!(wet >= WET_PCT)) return null;
  const midnight = start - minutesOfDay(item.startsAt, tz) * MINUTE;
  const busy = input.others.map((other) => ({
    from: other.startsAt.getTime() - BUFFER_MIN * MINUTE,
    to: (other.endsAt?.getTime() ?? other.startsAt.getTime() + HOUR) + BUFFER_MIN * MINUTE,
  }));
  const candidates: number[] = [];
  for (let minute = DAY_START_MIN; minute + length / MINUTE <= DAY_END_MIN; minute += STEP_MIN) {
    const from = midnight + minute * MINUTE;
    const to = from + length;
    if (from === start) continue;
    if (busy.some((slot) => from < slot.to && to > slot.from)) continue;
    const chance = chanceOver(weather, from, to);
    if (Number.isNaN(chance) || chance >= DRY_PCT) continue;
    candidates.push(from);
  }
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) =>
    Math.abs(b - start) < Math.abs(a - start) ||
    (Math.abs(b - start) === Math.abs(a - start) && b > a)
      ? b
      : a,
  );
  const rainy = weather
    .filter((hour) => hour.chance_of_rain >= WET_PCT)
    .map((hour) => Date.parse(hour.at))
    .filter((at) => at >= midnight && at < midnight + 24 * HOUR)
    .sort((a, b) => a - b);
  const rainFrom = local(new Date(rainy[0] ?? start), tz);
  const rainTo = local(new Date((rainy.at(-1) ?? start) + HOUR), tz);
  const startsAt = new Date(best);
  return {
    startsAt,
    endsAt: new Date(best + length),
    rainFrom,
    rainTo,
    facts: {
      title: item.title,
      from: local(item.startsAt, tz),
      to: local(startsAt, tz),
      rain_from: rainFrom,
      rain_until: rainTo,
      rain_pct: Math.round(wet),
    },
  };
}
