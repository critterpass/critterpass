/**
 * A fit context from stored rows: the plan version's days and timed items, who is on the trip,
 * the stay per night, rain per date and the month's crowd factor. The server's fit routes, the
 * plan check job and the phone read the same rows and build the same context through this.
 *
 * The first day waits for the usual arrival and the last ends for the usual departure, unless
 * the plan's own items say otherwise (a flight item blocks the day by itself). The arrival day
 * never opens before its own first stop: the crew's day starts when the plan says it does. A
 * day that has already begun (`now`) opens now.
 */
import {
  ARRIVAL_BUFFER_MIN,
  ceilGrid,
  DEFAULT_ARRIVAL_MIN,
  DEFAULT_DEPARTURE_MIN,
  DEPARTURE_BUFFER_MIN,
  minuteOfDate,
} from '../draft/schedule-day';
import { dayTripReach, MOVES_ON_AT_MIN } from '../draft/day-window';
import type {
  FitContext,
  FitDay,
  FitDayKind,
  FitItem,
  FitPoint,
  FitRain,
  FitThresholds,
  FitTravel,
} from './context';

const DAY_FROM = 7 * 60;
const DAY_TO = 22 * 60;

export interface FitDayRow {
  readonly day_id: string;
  readonly day_no: number;
  /** Local date; days without one are left out. */
  readonly date: string | null;
  /** The destination the day is spent in (absent: not read, any place may go on it). */
  readonly area_id?: string | null;
  /** A day trip's link minutes each way: the day opens and closes around the journey. */
  readonly link_minutes?: number | null;
  /** The local minute the crew reaches a later stop on its first day there. */
  readonly arrives_min?: number | null;
}

/** A trip's areas as `tripAreas` (`@cp/db`) reads them, as far as the fit needs them. */
export interface FitTripAreas {
  readonly areaIds: readonly string[];
  readonly stops: readonly {
    readonly position: number;
    readonly destinationId: string;
    readonly firstDay: number;
    readonly onwardLink: { readonly minutes: number } | null;
  }[];
  readonly days: readonly {
    readonly dayId: string;
    readonly areaId: string;
    readonly stopPosition: number;
    readonly link: { readonly minutes: number } | null;
  }[];
}

/**
 * The days with the area each is spent in, a day trip's link and the arrival at a later stop. A
 * trip of one destination is returned as it is, so its fit reads exactly as before.
 */
export function withDayAreas(
  days: readonly FitDayRow[],
  areas: FitTripAreas | null,
): readonly FitDayRow[] {
  if (areas === null || areas.areaIds.length < 2) return days;
  const byDay = new Map(areas.days.map((day) => [day.dayId, day]));
  return days.map((row) => {
    const day = byDay.get(row.day_id);
    if (day === undefined) return row;
    const stop = areas.stops.find((s) => s.position === day.stopPosition);
    const away = stop !== undefined && day.areaId !== stop.destinationId;
    const moves = stop !== undefined && stop.position > 1 && stop.firstDay === row.day_no;
    return {
      ...row,
      area_id: day.areaId,
      ...(away && day.link !== null ? { link_minutes: day.link.minutes } : {}),
      ...(moves && stop.onwardLink !== null
        ? { arrives_min: MOVES_ON_AT_MIN + stop.onwardLink.minutes }
        : {}),
    };
  });
}

/** The hours a day trip or an arrival at a later stop leaves (./day-window's rule). */
function reachedHours(day: FitDayRow): { fromMin: number; toMin: number } | null {
  if (day.link_minutes != null) {
    const reach = dayTripReach(day.link_minutes);
    return { fromMin: ceilGrid(reach.fromMin), toMin: reach.untilMin };
  }
  if (day.arrives_min != null) {
    return { fromMin: ceilGrid(day.arrives_min + ARRIVAL_BUFFER_MIN), toMin: DAY_TO };
  }
  return null;
}

export interface FitItemRow {
  readonly stable_id: string;
  readonly day_id: string;
  readonly poi_id: string | null;
  readonly category: string | null;
  readonly starts_at: Date | null;
  readonly ends_at: Date | null;
  readonly attendee_ids: readonly string[] | null;
  /** Booked or locked. */
  readonly locked: boolean;
  readonly is_outdoor: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface FitContextRows {
  readonly tz: string;
  readonly participants: readonly string[];
  readonly driveFactor: number;
  readonly days: readonly FitDayRow[];
  readonly items: readonly FitItemRow[];
  /** The stay per local date; absent = no anchor that night. */
  readonly stays: ReadonlyMap<string, FitPoint>;
  readonly rain: ReadonlyMap<string, FitRain>;
  /** Crowd factor by month (1-12); absent = 1. */
  readonly monthFactors: ReadonlyMap<number, number>;
  readonly thresholds?: Partial<FitThresholds>;
  readonly travel?: FitTravel;
  /** Now: on a day that has begun, nothing is fitted before it. */
  readonly now?: Date;
}

function toItem(row: FitItemRow): FitItem | null {
  if (row.starts_at === null || row.ends_at === null) return null;
  return {
    stableId: row.stable_id,
    poiId: row.poi_id,
    category: row.category,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    attendeeIds: row.attendee_ids ?? [],
    locked: row.locked,
    outdoor: row.is_outdoor,
    point: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
  };
}

function kindOf(index: number, count: number): FitDayKind {
  if (count > 1 && index === 0) return 'arrival';
  if (count > 1 && index === count - 1) return 'departure';
  return 'full';
}

export function assembleFitContext(rows: FitContextRows): FitContext {
  const dated = [...rows.days]
    .filter((day): day is FitDayRow & { date: string } => day.date !== null)
    .sort((a, b) => a.day_no - b.day_no);
  const days: FitDay[] = dated.map((day, index) => {
    const kind = kindOf(index, dated.length);
    const items = rows.items
      .filter((item) => item.day_id === day.day_id)
      .flatMap((item) => {
        const fit = toItem(item);
        return fit === null ? [] : [fit];
      });
    const firstStop = Math.min(
      ...items
        .filter((item) => item.category !== 'stay')
        .map((item) => minuteOfDate(item.startsAt, day.date, rows.tz)),
    );
    const landed = Math.max(DAY_FROM, ceilGrid(DEFAULT_ARRIVAL_MIN + ARRIVAL_BUFFER_MIN));
    // A day that has begun: what is left of it starts now.
    const nowMin =
      rows.now === undefined ? -1 : ceilGrid(minuteOfDate(rows.now, day.date, rows.tz));
    const reached = reachedHours(day);
    return {
      dayId: day.day_id,
      dayNo: day.day_no,
      date: day.date,
      kind,
      fromMin: Math.max(
        nowMin >= 0 && nowMin < 1440 ? nowMin : 0,
        kind === 'arrival'
          ? Number.isFinite(firstStop)
            ? Math.max(landed, firstStop)
            : landed
          : DAY_FROM,
        reached?.fromMin ?? 0,
      ),
      toMin: Math.min(
        kind === 'departure'
          ? Math.min(DAY_TO, DEFAULT_DEPARTURE_MIN - DEPARTURE_BUFFER_MIN)
          : DAY_TO,
        reached?.toMin ?? DAY_TO,
      ),
      ...(day.area_id === undefined ? {} : { areaId: day.area_id }),
      ...(day.link_minutes == null ? {} : { link: { minutes: day.link_minutes } }),
      items,
      stay: rows.stays.get(day.date) ?? null,
      rain: rows.rain.get(day.date) ?? null,
      crowdFactor: rows.monthFactors.get(Number(day.date.slice(5, 7))) ?? 1,
    };
  });
  return {
    tz: rows.tz,
    participants: [...new Set(rows.participants)].sort(),
    days,
    driveFactor: rows.driveFactor,
    ...(rows.travel === undefined ? {} : { travel: rows.travel }),
    ...(rows.thresholds === undefined ? {} : { thresholds: rows.thresholds }),
  };
}
