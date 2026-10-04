/**
 * The plan's map and calendar views as data. Map: one numbered pin per placed item (numbered in
 * time order within its day) and one line per day through its pins, in the day's colour, framed
 * to fit. Calendar: the weeks the trip spans, Monday first, each trip date carrying its day and
 * how many items it holds.
 */
/* eslint-disable lingui/no-unlocalized-strings -- ISO date pieces, never copy. */
import type { LegPaths } from '@/data/legs/version-leg-paths';
import { dayPath } from '@/ui/map/planning/route-trace';

import type { PlanDay, PlanItem } from '../../overview/model/plan-model';

export interface MapPin {
  readonly key: string;
  readonly stableId: string;
  readonly dayNo: number;
  /** 1-based order within the day. */
  readonly number: number;
  readonly label: string;
  readonly category: string | null;
  readonly lng: number;
  readonly lat: number;
}

export interface DayRoute {
  readonly dayNo: number;
  readonly coordinates: readonly (readonly [number, number])[];
}

export interface PlanMapModel {
  readonly pins: readonly MapPin[];
  readonly routes: readonly DayRoute[];
  /** `[west, south, east, north]`, or null with fewer than two points. */
  readonly bounds: readonly [number, number, number, number] | null;
  readonly center: readonly [number, number] | null;
}

/** `legPaths`: the roads of the version's synced legs; a pair without one is drawn straight. */
export function planMapModel(
  items: readonly PlanItem[],
  dayFilter: number | null,
  legPaths?: LegPaths,
): PlanMapModel {
  const placed = items
    .filter((item) => item.lat !== null && item.lng !== null)
    .filter((item) => dayFilter === null || item.dayNo === dayFilter)
    .sort((a, b) => a.dayNo - b.dayNo || (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  const counters = new Map<number, number>();
  const pins = placed.map((item): MapPin => {
    const number = (counters.get(item.dayNo) ?? 0) + 1;
    counters.set(item.dayNo, number);
    return {
      key: `${item.dayNo}:${item.stableId}`,
      stableId: item.stableId,
      dayNo: item.dayNo,
      number,
      label: item.label ?? '',
      category: item.category,
      lng: item.lng ?? 0,
      lat: item.lat ?? 0,
    };
  });
  const routes = [...counters.keys()].flatMap((dayNo): DayRoute[] => {
    const stops = pins
      .filter((pin) => pin.dayNo === dayNo)
      .map((pin) => ({ id: pin.stableId, n: pin.number, lat: pin.lat, lng: pin.lng }));
    if (stops.length < 2) return [];
    const day = { dayNo, color: '', stops, ...(legPaths === undefined ? {} : { legPaths }) };
    return [{ dayNo, coordinates: dayPath(day, null) }];
  });
  const lngs = pins.map((pin) => pin.lng);
  const lats = pins.map((pin) => pin.lat);
  const bounds =
    pins.length < 2
      ? null
      : ([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as const);
  const first = pins[0];
  return { pins, routes, bounds, center: first === undefined ? null : [first.lng, first.lat] };
}

export interface CalendarCell {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly inMonth: boolean;
  readonly dayNo: number | null;
  readonly items: number;
  readonly today: boolean;
}

export interface CalendarMonth {
  /** First of the month, `YYYY-MM-01`. */
  readonly month: string;
  readonly weeks: readonly (readonly CalendarCell[])[];
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** 0 for Monday … 6 for Sunday. */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Month grids covering every dated trip day; empty while the dates are open. */
export function calendarMonths(
  days: readonly PlanDay[],
  items: readonly PlanItem[],
  today: string | null,
): CalendarMonth[] {
  const dated = days.filter((day): day is PlanDay & { date: string } => day.date !== null);
  if (dated.length === 0) return [];
  const byDate = new Map(dated.map((day) => [day.date, day.dayNo]));
  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.dayNo, (counts.get(item.dayNo) ?? 0) + 1);
  const dates = dated.map((day) => day.date).sort();
  const firstMonth = `${dates[0]?.slice(0, 7) ?? ''}-01`;
  const lastMonth = `${dates.at(-1)?.slice(0, 7) ?? ''}-01`;
  const months: CalendarMonth[] = [];
  for (let month = firstMonth; month <= lastMonth;) {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y ?? 0, m ?? 1, 1)).toISOString().slice(0, 10);
    const weeks: CalendarCell[][] = [];
    let cursor = addDays(month, -mondayIndex(month));
    while (cursor < next) {
      const week: CalendarCell[] = [];
      for (let i = 0; i < 7; i += 1) {
        const dayNo = byDate.get(cursor) ?? null;
        week.push({
          date: cursor,
          inMonth: cursor.slice(0, 7) === month.slice(0, 7),
          dayNo,
          items: dayNo === null ? 0 : (counts.get(dayNo) ?? 0),
          today: cursor === today,
        });
        cursor = addDays(cursor, 1);
      }
      weeks.push(week);
    }
    months.push({ month, weeks });
    month = next;
  }
  return months;
}
