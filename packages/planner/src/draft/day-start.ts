/**
 * When a day begins. A day usually opens at the crew's hour (later for night owls), but two
 * things open it sooner. A long outdoor sight that is best early (a mountain of three hours, a
 * waterfall an hour out of town: `opensDay`) opens its day, up to an hour and a half before the
 * usual start and never before half past seven: by the afternoon it is cloud, heat or crowds, and
 * since nearly every place says "early morning", it is these the planner honours first. And once
 * the crew is out early for a stop with a time of its own (a breakfast it asked for), the next
 * stop follows on instead of waiting for the usual hour, when that wait is two hours or less. A
 * day the crew asked to start later is never opened sooner by a sight: they asked for the morning.
 */
import { placeTime } from './time-of-day';
import { typedEarlyNeed, type TypedPoi } from './typed-facts';
import type { DayWindow, DraftPoi, TravelMatrix } from './types';

const OPEN_AIR: ReadonlySet<string> = new Set(['nature', 'beach']);
/** An outdoor visit this long is one a day is built around. */
const LONG_VISIT_MIN = 120;
const EARLY_BY_MIN = 90;
const EARLIEST_OPEN_MIN = 7 * 60 + 30;
/** A day with a morning: its window opens by half past ten (not the day the crew lands). */
const MORNING_WINDOW_BY_MIN = 10 * 60 + 30;
const FOLLOW_ON_MAX_MIN = 120;

/** Where the crew sleeps and how far a day reaches, for telling a far place from a near one. */
export interface Reach {
  readonly homeId?: string | null | undefined;
  readonly hopCapMin?: number | undefined;
  readonly travel: TravelMatrix;
}

/** Whether `poi` is a long or far outdoor sight that is best early: it opens the day it is on. */
export function opensDay(poi: DraftPoi, reach: Reach): boolean {
  if (!OPEN_AIR.has(poi.category) || placeTime(poi) !== 'morning') return false;
  if (poi.durationMin >= LONG_VISIT_MIN) return true;
  const { homeId, hopCapMin } = reach;
  if (homeId == null || hopCapMin === undefined) return false;
  return (reach.travel(homeId, poi.id) ?? 0) > hopCapMin;
}

/**
 * The earliest a stop with no time of its own may start: the usual start of the day; sooner for
 * a stop that opens the day; and straight after an earlier stop that ended before the usual start
 * (`earlierEndMin`), when the wait would be two hours or less.
 */
export function startFloor(
  window: DayWindow,
  opener: boolean,
  earlierEndMin: number | null,
): number {
  let floor = window.startMin;
  if (opener && window.laterStart !== true && window.startMin <= MORNING_WINDOW_BY_MIN) {
    const early = Math.max(EARLIEST_OPEN_MIN, window.startMin - EARLY_BY_MIN);
    floor = Math.min(floor, Math.max(early, window.earliestMin ?? 0));
  }
  if (
    earlierEndMin !== null &&
    earlierEndMin < window.startMin &&
    window.startMin - earlierEndMin <= FOLLOW_ON_MAX_MIN
  ) {
    floor = Math.min(floor, earlierEndMin);
  }
  return floor;
}

const SUNRISE_WORDS = /\b(sunrise|dawn|first light)\b|\b(binh minh|rang dong|som nhat)\b/u;
const EARLY_WORDS =
  /\b(early|first|before (the )?(crowds|queues|heat|tour)|opening)\b|\b(som|sang som)\b/u;

/**
 * How strongly a place needs the start of the day: 3 for sunrise, 2 when our editors say early or
 * before the crowds (or its typed times say early morning), 1 for any morning, 0 otherwise. Of two
 * places that would open one day, the stronger keeps the morning.
 */
export function earlyNeed(poi: Pick<DraftPoi, 'bestTime'> & Partial<DraftPoi>): number {
  // A typed place is a whole one: the loader sets typed facts only on full rows.
  if (poi.bestTimes !== undefined) return typedEarlyNeed(poi as TypedPoi);
  const said = (poi.bestTime ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase();
  if (SUNRISE_WORDS.test(said)) return 3;
  if (EARLY_WORDS.test(said)) return 2;
  return /\bmorning\b|\bbuoi sang\b|\bsang\b/u.test(said) ? 1 : 0;
}
