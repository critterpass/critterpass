/**
 * One day as the fit engine sees it: timed items in local minutes of the day's date, who each
 * one takes, and what is locked. The stay's own item is where the crew sleeps, not something it
 * is busy with, and a place's own item never blocks the place.
 */
import { minuteOfDate } from '../draft/schedule-day';
import type { FitDay, FitItem, FitPoint } from './context';

export interface ModelItem {
  readonly stableId: string;
  readonly start: number;
  readonly end: number;
  /** Who goes (the whole crew when the item names nobody). */
  readonly people: ReadonlySet<string>;
  readonly locked: boolean;
  readonly point: FitPoint | null;
}

export interface DayModel {
  readonly day: FitDay;
  readonly items: readonly ModelItem[];
  readonly everyone: readonly string[];
}

export function buildDayModel(
  day: FitDay,
  participants: readonly string[],
  tz: string,
  skipStableId?: string | null,
): DayModel {
  const items = day.items
    .filter((item) => item.category !== 'stay' && item.stableId !== skipStableId)
    .map((item) => toModelItem(item, day.date, tz, participants))
    .sort((a, b) => a.start - b.start || a.end - b.end || (a.stableId < b.stableId ? -1 : 1));
  return { day, items, everyone: [...participants].sort() };
}

function toModelItem(
  item: FitItem,
  date: string,
  tz: string,
  participants: readonly string[],
): ModelItem {
  const start = minuteOfDate(item.startsAt, date, tz);
  const end = Math.max(start, minuteOfDate(item.endsAt, date, tz));
  return {
    stableId: item.stableId,
    start,
    end,
    people: new Set(item.attendeeIds.length > 0 ? item.attendeeIds : participants),
    locked: item.locked,
    point: item.point,
  };
}

export function overlaps(item: ModelItem, start: number, end: number): boolean {
  return item.start < end && item.end > start;
}

export function sharesPeople(item: ModelItem, people: readonly string[]): boolean {
  return people.some((uid) => item.people.has(uid));
}

/** The last item of `people` ending by `minute`, ignoring `skip`. */
export function previousItem(
  model: DayModel,
  minute: number,
  people: readonly string[],
  skip?: string,
): ModelItem | null {
  let found: ModelItem | null = null;
  for (const item of model.items) {
    if (item.stableId === skip || item.end > minute || !sharesPeople(item, people)) continue;
    if (found === null || item.end >= found.end) found = item;
  }
  return found;
}

/** The first item of `people` starting at or after `minute`, ignoring `skip`. */
export function nextItem(
  model: DayModel,
  minute: number,
  people: readonly string[],
  skip?: string,
): ModelItem | null {
  for (const item of model.items) {
    if (item.stableId === skip || item.start < minute || !sharesPeople(item, people)) continue;
    return item;
  }
  return null;
}

/** Local `HH:MM` of a minute of the day (a minute past midnight wraps). */
export function clockOf(minute: number): string {
  const wrapped = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
