/**
 * The plan's free windows worked out on the phone from synced rows, with the same planner the
 * server runs (`assembleFitContext` + `dayGaps`): the current version's dated days and timed items,
 * who is on the trip, and straight-line "about" travel to see when people must leave for the next
 * item. Each gap keeps its day's date and the name of what the others are doing meanwhile.
 *
 * The planner counts a window only when two or more people are free together. Someone travelling
 * alone has free time too: for one person the windows are the stretches of an hour or more between
 * 07:00 and 22:00 that no stop covers, so a day with one stop (or none) is open.
 */
import { GAP_MIN_MINUTES, toLocalWallTime } from '@cp/domain';
import {
  DEFAULT_FIT_THRESHOLDS,
  assembleFitContext,
  dayGaps,
  straightLineTravel,
} from '@cp/planner';

import type { DatedGap } from './trip-explore-model';

export interface GapItemRow {
  readonly stable_id: string;
  readonly day_id: string;
  readonly poi_id: string | null;
  readonly category: string | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly attendee_ids: readonly string[];
  readonly locked: boolean;
  readonly is_outdoor: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly name: string | null;
}

export interface PlanGapRows {
  readonly tz: string;
  readonly driveFactor: number;
  readonly participants: readonly string[];
  readonly days: readonly {
    readonly day_id: string;
    readonly day_no: number;
    readonly date: string | null;
  }[];
  readonly items: readonly GapItemRow[];
}

export interface PlanGap extends DatedGap {
  /** What the crewmates who are not free are doing (the first busy item), when it has a name. */
  readonly busyName: string | null;
}

function instant(value: string | null): Date | null {
  if (value === null) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

const SOLO_EARLIEST = 7 * 60;
const SOLO_LATEST = 22 * 60;
/** A stop with no end is taken to last this long. */
const UNTIMED_END_MINUTES = 60;

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function minuteOn(at: Date, tz: string, date: string): number {
  const wall = toLocalWallTime(at, tz);
  if (wall.date < date) return 0;
  if (wall.date > date) return 24 * 60;
  const [hours, minutes] = wall.time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** One person's free windows: every dated day's stretches of an hour or more that no stop covers. */
export function soloGaps(rows: PlanGapRows): PlanGap[] {
  const who = rows.participants.slice(0, 1);
  return rows.days.flatMap((day) => {
    const date = day.date;
    if (date === null) return [];
    const stops = rows.items
      .flatMap((item) => {
        const start = instant(item.starts_at);
        if (item.day_id !== day.day_id || start === null) return [];
        const from = minuteOn(start, rows.tz, date);
        const end = instant(item.ends_at);
        const to = end === null ? from + UNTIMED_END_MINUTES : minuteOn(end, rows.tz, date);
        return [{ id: item.stable_id, from, to: Math.max(to, from) }];
      })
      .sort((a, b) => a.from - b.from);
    const gaps: PlanGap[] = [];
    const open = (from: number, to: number, after: string | null, next: string | null) => {
      if (to - from < GAP_MIN_MINUTES) return;
      gaps.push({
        date,
        busyName: null,
        gap: {
          day_id: day.day_id,
          day_no: day.day_no,
          from: clock(from),
          to: clock(to),
          minutes: to - from,
          who_free: [...who],
          busy: [],
          after_item: after,
          next_item: next,
        },
      });
    };
    let cursor = SOLO_EARLIEST;
    let last: string | null = null;
    for (const stop of stops) {
      open(cursor, Math.min(stop.from, SOLO_LATEST), last, stop.id);
      if (stop.to > cursor) {
        cursor = stop.to;
        last = stop.id;
      }
    }
    open(cursor, SOLO_LATEST, last, null);
    return gaps;
  });
}

export function planGaps(rows: PlanGapRows): PlanGap[] {
  if (rows.participants.length === 1) return soloGaps(rows);
  const context = assembleFitContext({
    tz: rows.tz,
    participants: rows.participants,
    driveFactor: rows.driveFactor,
    days: rows.days,
    items: rows.items.map((item) => ({
      ...item,
      starts_at: instant(item.starts_at),
      ends_at: instant(item.ends_at),
    })),
    stays: new Map(),
    rain: new Map(),
    monthFactors: new Map(),
    travel: straightLineTravel(rows.driveFactor, DEFAULT_FIT_THRESHOLDS.walkMaxM),
  });
  const names = new Map(rows.items.map((item) => [item.stable_id, item.name]));
  return context.days.flatMap((day) =>
    dayGaps(context, day).map(({ gap }) => ({
      gap,
      date: day.date,
      busyName: gap.busy.map((busy) => names.get(busy.stable_id) ?? null).find(Boolean) ?? null,
    })),
  );
}
